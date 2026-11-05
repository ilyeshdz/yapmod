import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

import { createManifest } from "./targets/web/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "client");

/**
 * The bundles the client can build.
 *
 * A target owns its composition roots, its output directory and, when it is a
 * browser extension, its manifest. Targets share the rest of `client/`; they
 * must not import each other.
 */
const targets = {
  desktop: {
    entryPoints: [
      join(sourceDir, "targets", "desktop", "preinject.ts"),
      join(sourceDir, "targets", "desktop", "postinject.tsx"),
    ],
    outdir: join(root, "src-tauri", "gen", "injection"),
  },
  web: {
    entryPoints: [
      join(sourceDir, "targets", "web", "bridge.ts"),
      join(sourceDir, "targets", "web", "preinject.ts"),
      join(sourceDir, "targets", "web", "background.ts"),
    ],
    outdir: join(root, "dist", "web"),
    manifest: createManifest,
    // Static files the manifest references; copied next to the bundles.
    assets: [
      {
        from: join(sourceDir, "targets", "web", "icons"),
        to: join(root, "dist", "web", "icons"),
      },
    ],
  },
};

const targetArg = process.argv.find((argument) =>
  argument.startsWith("--target="),
);
const targetName =
  targetArg?.slice("--target=".length) ?? process.env.YAPMOD_TARGET ?? "desktop";
const target = targets[targetName];

if (!target) {
  throw new Error(
    `[yapmod] unknown client target "${targetName}", expected one of: ${Object.keys(targets).join(", ")}`,
  );
}

await mkdir(target.outdir, { recursive: true });

if (target.assets) {
  for (const asset of target.assets) {
    await cp(asset.from, asset.to, { recursive: true });
  }
}

if (target.manifest) {
  const versionFile = JSON.parse(
    await readFile(join(sourceDir, "version.json"), "utf8"),
  );

  await writeFile(
    join(target.outdir, "manifest.json"),
    `${JSON.stringify(target.manifest(versionFile.version), null, 2)}\n`,
  );
}

const options = {
  entryPoints: target.entryPoints,
  outdir: target.outdir,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  loader: { ".svg": "text", ".css": "text" },
  // Solid compiles JSX to DOM templates, so it needs its own transform.
  plugins: [solidPlugin()],
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const context = await build.context(options);
  await context.watch();
  console.log("Watching client source files for changes...");
} else {
  await build(options);
}
