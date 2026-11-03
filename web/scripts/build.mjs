#!/usr/bin/env node
/**
 * Build entry point for the website.
 *
 * Commands:
 *   dev      Generate docs data and community catalogs, then run Astro
 *   build    Generate docs data, build Astro, then publish community catalogs
 *   check    Verify generated docs data and type-check the site
 *   docs     Regenerate (or verify with --check) the docs data
 *   community [--dev]  Build the plugin and theme catalogs
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlugins, buildThemes } from "./community.mjs";
import { generate as generateDocs } from "./generate-docs-data.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];
const dev = args.includes("--dev");
const check = args.includes("--check");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: webRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function astro(...astroArgs) {
  const bin = join(
    webRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "astro.cmd" : "astro",
  );
  run(bin, astroArgs);
}

function docs(checkMode = check) {
  if (!generateDocs({ check: checkMode })) process.exit(1);
}

function community({ devMode = dev } = {}) {
  buildPlugins({ dev: devMode, webRoot });
  buildThemes({ dev: devMode, webRoot });
}

switch (command) {
  case "dev":
    docs();
    community({ devMode: true });
    astro("dev");
    break;
  case "build":
    docs();
    astro("build");
    community({ devMode: false });
    break;
  case "check":
    docs(true);
    astro("check");
    break;
  case "docs":
    docs();
    break;
  case "community":
    community();
    break;
  default:
    console.error(
      "Usage: node scripts/build.mjs <dev|build|check|docs|community> [--dev|--check]",
    );
    process.exit(1);
}
