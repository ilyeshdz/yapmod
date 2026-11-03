#!/usr/bin/env node
/**
 * Build entry point for everything outside the website.
 *
 * Commands:
 *   client [--watch]       Bundle the injected client into src-tauri/gen/injection
 *   types [--check]        Regenerate (or verify) the TypeScript bindings
 *   app-version [version]  Write a release version into Cargo/tauri metadata
 *   web <command>          Delegate to the website's build entry point
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));

async function buildClient() {
  const { build } = await import("esbuild");
  const { solidPlugin } = await import("esbuild-plugin-solid");

  const sourceDir = join(root, "client");
  const outdir = join(root, "src-tauri", "gen", "injection");

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

  if (flags.has("--watch")) {
    const context = await build.context(options);
    await context.watch();
    console.log("Watching client source files for changes...");
    return;
  }

  await build(options);
}

function normalizeGenerated(dir) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      normalizeGenerated(path);
      continue;
    }

    if (!entry.name.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(path, "utf8");
    const normalized = source
      .replace(/\r\n/g, "\n")
      .replace(/(\bfrom\s+"[^"]*?)\\+/g, "$1/");

    if (normalized !== source) {
      writeFileSync(path, normalized);
    }
  }
}

function buildTypes() {
  const generated = join("client", "generated");
  const generatedDir = resolve(root, generated);
  const check = flags.has("--check");

  // The ts-rs export runs as part of the test suite. Point it at the
  // committed client bindings so tests and exports stay in sync.
  const child = spawn(
    "cargo",
    ["test", "--manifest-path", "src-tauri/Cargo.toml"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        TS_RS_EXPORT_DIR: generatedDir,
      },
    },
  );

  child.on("exit", (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }

    normalizeGenerated(generatedDir);

    if (!check) {
      process.exit(0);
    }

    const diff = spawnSync(
      "git",
      ["diff", "--quiet", "--ignore-space-at-eol", "--", generated],
      { cwd: root },
    );
    const untracked = spawnSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "--", generated],
      { cwd: root, encoding: "utf8" },
    );

    if (diff.status !== 0 || untracked.stdout.trim()) {
      const renderedDiff = spawnSync(
        "git",
        ["diff", "--ignore-space-at-eol", "--", generated],
        { cwd: root, encoding: "utf8" },
      );

      console.error(
        "The generated types are out of date, run `pnpm types:generate`.",
      );

      if (untracked.stdout.trim()) {
        console.error(`Untracked generated files:\n${untracked.stdout}`);
      }

      if (renderedDiff.stdout.trim()) {
        console.error(renderedDiff.stdout);
      }

      process.exit(1);
    }
  });
}

function setAppVersion() {
  const version = process.env.APP_VERSION ?? args[1];
  const msiVersion = process.env.MSI_VERSION;

  if (
    !version ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error(
      "Set APP_VERSION or pass a valid semantic version as the first argument.",
    );
  }

  const configPath = join(root, "src-tauri/tauri.conf.json");
  let tauriConfig;
  if (msiVersion) {
    const parts = msiVersion.split(".").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0) ||
      parts[0] > 255 ||
      parts[1] > 255 ||
      parts[2] > 65535 ||
      parts[3] > 65535
    ) {
      throw new Error(
        "MSI_VERSION must be a numeric major.minor.patch.build version within MSI limits.",
      );
    }

    tauriConfig = JSON.parse(readFileSync(configPath, "utf8"));
    tauriConfig.bundle ??= {};
    tauriConfig.bundle.windows ??= {};
    tauriConfig.bundle.windows.wix ??= {};
    tauriConfig.bundle.windows.wix.version = msiVersion;
  }

  const manifestPath = join(root, "src-tauri/Cargo.toml");
  const lockPath = join(root, "src-tauri/Cargo.lock");
  const manifest = readFileSync(manifestPath, "utf8");
  const packageStart = manifest.indexOf("[package]");
  const nextSection = manifest.indexOf("\n[", packageStart + "[package]".length);

  if (packageStart === -1) {
    throw new Error(`Could not find [package] in ${manifestPath}.`);
  }

  const packageEnd = nextSection === -1 ? manifest.length : nextSection;
  const packageSection = manifest.slice(packageStart, packageEnd);
  const versionLine = /^version\s*=\s*"[^"]+"(\r?)$/m;

  if (!versionLine.test(packageSection)) {
    throw new Error(`Could not find package version in ${manifestPath}.`);
  }

  const updatedManifest =
    manifest.slice(0, packageStart) +
    packageSection.replace(versionLine, `version = "${version}"$1`) +
    manifest.slice(packageEnd);

  const lock = readFileSync(lockPath, "utf8");
  const packageBlocks = lock.split(/(?=^\[\[package\]\]\r?$)/m);
  let lockMatches = 0;
  const updatedLock = packageBlocks
    .map((block) => {
      if (!/^name = "yapmod"\r?$/m.test(block)) return block;
      lockMatches += 1;
      if (!/^version = "[^"]+"\r?$/m.test(block)) {
        throw new Error(`Could not find yapmod package version in ${lockPath}.`);
      }
      return block.replace(
        /^version = "[^"]+"(\r?)$/m,
        `version = "${version}"$1`,
      );
    })
    .join("");

  if (lockMatches !== 1) {
    throw new Error(
      `Expected one yapmod package entry in ${lockPath}, found ${lockMatches}.`,
    );
  }

  writeFileSync(manifestPath, updatedManifest);
  writeFileSync(lockPath, updatedLock);
  if (tauriConfig) {
    writeFileSync(configPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
  }
}

function runWeb() {
  const webArgs = args.slice(1);
  const child = spawn(
    process.execPath,
    [join(root, "web", "scripts", "build.mjs"), ...webArgs],
    { cwd: join(root, "web"), stdio: "inherit" },
  );

  child.on("exit", (code) => process.exit(code ?? 1));
}

switch (command) {
  case "client":
    await buildClient();
    break;
  case "types":
    buildTypes();
    break;
  case "app-version":
    setAppVersion();
    break;
  case "web":
    runWeb();
    break;
  default:
    console.error(
      "Usage: node scripts/build.mjs <client|types|app-version|web> [options]",
    );
    process.exit(1);
}
