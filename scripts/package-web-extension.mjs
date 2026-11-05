#!/usr/bin/env node
/**
 * Packages the built web extension into a zip.
 *
 * Chrome stores and release pages expect the manifest at the root of the
 * archive, so the contents of `dist/web` are zipped, not the folder itself.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTDIR = join(root, "dist", "web");

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { time, day };
}

/**
 * Builds a zip from `{ name, bytes }` entries. Compression is deflate so the
 * bundles do not balloon on disk.
 */
export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.bytes);
    const crc = crc32(entry.bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function collectFiles(directory, base = directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, base)));
    } else if (entry.isFile()) {
      files.push({
        name: relative(base, path).split(sep).join("/"),
        bytes: await readFile(path),
      });
    }
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

export async function packageWebExtension(outdir = DEFAULT_OUTDIR, output) {
  const manifestPath = join(outdir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // `dist/web` becomes `yapmod-web-<version>.zip`; `dist/web-loader` becomes
  // `yapmod-web-loader-<version>.zip`.
  const packageName = `yapmod-${basename(resolve(outdir)).replace(/[^a-z0-9-]/gi, "-")}`;
  const target = resolve(
    output ?? join(dirname(outdir), `${packageName}-${manifest.version}.zip`),
  );
  const files = await collectFiles(outdir);

  if (!files.some((file) => file.name === "manifest.json")) {
    throw new Error("the web build has no manifest.json");
  }

  await writeFile(target, createZip(files));

  return { path: target, version: manifest.version, files: files.length };
}

async function main() {
  const outArgIndex = process.argv.indexOf("--out");
  const output = outArgIndex === -1 ? undefined : process.argv[outArgIndex + 1];
  const dirArgIndex = process.argv.indexOf("--dir");
  const dir = dirArgIndex === -1 ? undefined : process.argv[dirArgIndex + 1];
  const outdir = resolve(dir ?? process.env.WEB_OUTDIR ?? DEFAULT_OUTDIR);

  await stat(join(outdir, "manifest.json"));
  const result = await packageWebExtension(outdir, output);

  console.log(
    `packaged ${result.files} files as ${result.path} (extension v${result.version})`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
