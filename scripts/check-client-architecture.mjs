import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = join(root, "client");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

const files = await sourceFiles(client);
const relative = (path) => path.slice(client.length + 1).replaceAll("\\", "/");
const violations = [];

for (const file of files) {
  const name = relative(file);
  const source = await readFile(file, "utf8");
  const shared = !name.startsWith("targets/");

  if (shared && /from\s+["'][^"']*(?:\/targets\/|core\/tauri|\.\/tauri)["']/.test(source)) {
    violations.push(`${name} imports a target or the Tauri bridge`);
  }

  if (name.startsWith("targets/desktop/") && /["'][^"']*targets\/web/.test(source)) {
    violations.push(`${name} imports the web target`);
  }

  if (name.startsWith("targets/web/") && /["'][^"']*targets\/desktop/.test(source)) {
    violations.push(`${name} imports the desktop target`);
  }

  if (
    !["core/tauri.ts", "targets/desktop/host.ts"].includes(name) &&
    source.includes("invokeCommand")
  ) {
    violations.push(`${name} calls invokeCommand outside the desktop host`);
  }
}

assert.deepEqual(violations, []);
console.log("client architecture checks passed");
