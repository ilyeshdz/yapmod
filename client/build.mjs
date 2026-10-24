import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "client");
const outdir = join(root, "src-tauri", "gen", "injection");

await mkdir(outdir, { recursive: true });

const options = {
  entryPoints: [
    join(sourceDir, "preinject.ts"),
    join(sourceDir, "postinject.tsx"),
  ],
  outdir,
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
