import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

import { createManifest } from "./targets/web/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "client");
const clientVersion = JSON.parse(
  await readFile(join(sourceDir, "version.json"), "utf8"),
).version;
const updateChannel =
  process.env.YAPMOD_UPDATE_CHANNEL === "nightly" ? "nightly" : "stable";
const updatePublicKey = process.env.YAPMOD_CLIENT_UPDATE_PUBLIC_KEY ?? "";

/**
 * Values esbuild substitutes into every bundle.
 *
 * The channel is baked in, exactly like the desktop app, so a nightly package
 * never reads the stable signed feed.
 */
const sharedDefine = {
  __YAPMOD_CLIENT_VERSION__: JSON.stringify(clientVersion),
  __YAPMOD_UPDATE_CHANNEL__: JSON.stringify(updateChannel),
  __YAPMOD_CLIENT_UPDATE_PUBLIC_KEY__: JSON.stringify(updatePublicKey),
};

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
    // The extension shell has its own version; the client version is reported
    // at runtime and may move independently.
    versionFile: join(sourceDir, "targets", "web", "version.json"),
    define: { __YAPMOD_WEB_LOADER__: "false" },
    // Static files the manifest references; copied next to the bundles.
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
    manifest: createManifest,
    versionFile: join(sourceDir, "targets", "web", "version.json"),
    define: { __YAPMOD_WEB_LOADER__: "true" },
    assets: [
      {
        from: join(sourceDir, "targets", "web", "icons"),
        to: join(root, "dist", "web-loader", "icons"),
      },
    ],
    // The loader embeds the page-realm client so a fresh install works before
    // the first signed update arrives.
    embeddedClient: join(root, "dist", "web", "preinject.js"),
    // The loader build depends on the store build that produces the embedded
    // client.
    dependsOn: "web",
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

  if (current.assets) {
    for (const asset of current.assets) {
      await cp(asset.from, asset.to, { recursive: true });
    }
  }

  if (current.manifest) {
    const versionFile = JSON.parse(
      await readFile(
        current.versionFile ?? join(sourceDir, "version.json"),
        "utf8",
      ),
    );

    await writeFile(
      join(current.outdir, "manifest.json"),
      `${JSON.stringify(
        current.manifest(versionFile.version, {
          loader: name === "web-loader",
        }),
        null,
        2,
      )}\n`,
    );
  }

  const define = { ...sharedDefine, ...current.define };

  if (current.embeddedClient) {
    define.__YAPMOD_EMBEDDED_CLIENT__ = JSON.stringify(
      await readFile(current.embeddedClient, "utf8"),
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

  if (process.argv.includes("--watch")) {
    const context = await build.context(options);
    await context.watch();
    console.log(
      `Watching ${name} client source files for changes...`,
    );
  } else {
    await build(options);
  }
}

await buildTarget(targetName);
