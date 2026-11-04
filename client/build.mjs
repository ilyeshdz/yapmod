import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "client");

/**
 * The bundles the client can build.
 *
 * A target owns its composition roots and its output directory. Targets share
 * the rest of `client/`; they must not import each other.
 */
const targets = {
  desktop: {
    entryPoints: [
      join(sourceDir, "targets", "desktop", "preinject.ts"),
      join(sourceDir, "targets", "desktop", "postinject.tsx"),
    ],
    outdir: join(root, "src-tauri", "gen", "injection"),
  },
};

const targetName = process.env.YAPMOD_TARGET ?? "desktop";
const target = targets[targetName];

if (!target) {
  throw new Error(
    `[yapmod] unknown client target "${targetName}", expected one of: ${Object.keys(targets).join(", ")}`,
  );
}

await mkdir(target.outdir, { recursive: true });

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
