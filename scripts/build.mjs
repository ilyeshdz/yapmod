#!/usr/bin/env node
/**
 * Build entry point for everything outside the website.
 *
 * Commands:
 *   client [--target=name] Bundle an injected client target (desktop, web, web-loader)
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

function clientTargetName() {
  const argument = args.find((value) => value.startsWith("--target="));

  return argument?.slice("--target=".length) ?? "desktop";
}

function clientTargets() {
  const sourceDir = join(root, "client");
  const clientVersion = JSON.parse(
    readFileSync(join(sourceDir, "version.json"), "utf8"),
  ).version;
  const updateChannel =
    process.env.YAPMOD_UPDATE_CHANNEL === "nightly" ? "nightly" : "stable";
  const updatePublicKey = process.env.YAPMOD_CLIENT_UPDATE_PUBLIC_KEY ?? "";

  /**
   * Values esbuild substitutes into every bundle. The channel is baked in,
   * exactly like the desktop app, so a nightly package never reads the stable
   * signed feed.
   */
  const sharedDefine = {
    __YAPMOD_CLIENT_VERSION__: JSON.stringify(clientVersion),
    __YAPMOD_UPDATE_CHANNEL__: JSON.stringify(updateChannel),
    __YAPMOD_CLIENT_UPDATE_PUBLIC_KEY__: JSON.stringify(updatePublicKey),
  };

  /**
   * A target owns its composition roots, its output directory and, when it is
   * a browser extension, its manifest. Targets share the rest of `client/`;
   * they must not import each other.
   */
  return {
    sharedDefine,
    targets: {
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
        manifest: true,
        // The extension shell has its own version; the client version is
        // reported at runtime and may move independently.
        versionFile: join(sourceDir, "targets", "web", "version.json"),
        define: { __YAPMOD_WEB_LOADER__: "false" },
        assets: [
          {
            from: join(sourceDir, "targets", "web", "icons"),
            to: join(root, "dist", "web", "icons"),
          },
        ],
      },
      "web-loader": {
        entryPoints: [
          join(sourceDir, "targets", "web", "bridge.ts"),
          join(sourceDir, "targets", "web", "loader.ts"),
          join(sourceDir, "targets", "web", "background.ts"),
        ],
        outdir: join(root, "dist", "web-loader"),
        manifest: true,
        versionFile: join(sourceDir, "targets", "web", "version.json"),
        define: { __YAPMOD_WEB_LOADER__: "true" },
        assets: [
          {
            from: join(sourceDir, "targets", "web", "icons"),
            to: join(root, "dist", "web-loader", "icons"),
          },
        ],
        // The loader embeds the page-realm client so a fresh install works
        // before the first signed update arrives.
        embeddedClient: join(root, "dist", "web", "preinject.js"),
        // The loader build depends on the store build that produces the
        // embedded client.
        dependsOn: "web",
      },
    },
  };
}

async function buildClient() {
  const { build } = await import("esbuild");
  const { solidPlugin } = await import("esbuild-plugin-solid");
  const { cp, mkdir, writeFile } = await import("node:fs/promises");
  const { createManifest } = await import(
    join(root, "client", "targets", "web", "manifest.mjs")
  );

  const { sharedDefine, targets } = clientTargets();
  const targetName = clientTargetName();
  const target = targets[targetName];

  if (!target) {
    throw new Error(
      `Unknown client target "${targetName}", expected one of: ${Object.keys(targets).join(", ")}`,
    );
  }

  const watch = flags.has("--watch");
  const built = new Set();

  async function buildTarget(name) {
    if (built.has(name)) {
      return;
    }
    built.add(name);

    const current = targets[name];

    if (current.dependsOn) {
      await buildTarget(current.dependsOn);
    }

    await mkdir(current.outdir, { recursive: true });

    for (const asset of current.assets ?? []) {
      await cp(asset.from, asset.to, { recursive: true });
    }

    if (current.manifest) {
      const versionFile = JSON.parse(
        readFileSync(current.versionFile, "utf8"),
      );

      await writeFile(
        join(current.outdir, "manifest.json"),
        `${JSON.stringify(
          createManifest(versionFile.version, { loader: name === "web-loader" }),
          null,
          2,
        )}\n`,
      );
    }

    const define = { ...sharedDefine, ...current.define };

    if (current.embeddedClient) {
      define.__YAPMOD_EMBEDDED_CLIENT__ = JSON.stringify(
        readFileSync(current.embeddedClient, "utf8"),
      );
    }

    const options = {
      entryPoints: current.entryPoints,
      outdir: current.outdir,
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
      define,
      logLevel: "info",
    };

    if (watch) {
      const context = await build.context(options);
      await context.watch();
      console.log(`Watching ${name} client source files for changes...`);
      return;
    }

    await build(options);
  }

  await buildTarget(targetName);
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
