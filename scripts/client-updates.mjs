#!/usr/bin/env node
/**
 * Client update manifest tooling.
 *
 * yapmod publishes one signed client feed under `client-updates/stable/`. The
 * legacy stable paths are still written for installations built before the
 * feed was separated into a directory.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The only update channel. It is also written into every signed manifest and
 * bundle so installations built before the nightly channel was removed keep
 * validating the feed.
 */
export const UPDATE_CHANNEL = "stable";
export const BRIDGE_API_VERSION = 1;
export const DEFAULT_UPDATES_URL =
  "https://ilyeshdz.github.io/yapmod/client-updates";
export const MAX_MANIFEST_LIFETIME = 90 * 24 * 60 * 60;
export const DEFAULT_MANIFEST_LIFETIME = 60 * 24 * 60 * 60;

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Files published for the feed, relative to the client-updates root. */
export function feedPaths() {
  return {
    manifest: `${UPDATE_CHANNEL}/manifest.json`,
    signature: `${UPDATE_CHANNEL}/manifest.sig`,
    bundle: `${UPDATE_CHANNEL}/bundle.json`,
  };
}

/** Aliases consumed by installations from before the feed was versioned. */
export function legacyStablePaths() {
  return {
    manifest: "manifest.json",
    signature: "manifest.sig",
    bundle: "bundle.json",
  };
}

export function isValidVersion(version) {
  return (
    typeof version === "string" &&
    version.length > 0 &&
    version.length <= 64 &&
    VERSION_PATTERN.test(version)
  );
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateManifest(manifest, options = {}) {
  const { allowLegacyStable = false } = options;

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("the client update manifest is not an object");
  }
  if (allowLegacyStable) {
    if (
      manifest.channel !== undefined &&
      manifest.channel !== UPDATE_CHANNEL
    ) {
      throw new Error("the legacy manifest belongs to another channel");
    }
  } else if (manifest.channel !== UPDATE_CHANNEL) {
    throw new Error(
      `the client update manifest belongs to ${manifest.channel ?? "no channel"}, expected ${UPDATE_CHANNEL}`,
    );
  }
  if (!isValidVersion(manifest.clientVersion)) {
    throw new Error("the client update version is invalid");
  }
  if (
    !Number.isSafeInteger(manifest.releaseSequence) ||
    manifest.releaseSequence < 1
  ) {
    throw new Error("the client update release sequence is invalid");
  }
  if (manifest.bridgeApiVersion !== BRIDGE_API_VERSION) {
    throw new Error("the client update bridge API is unsupported");
  }
  if (!isValidVersion(manifest.minAppVersion)) {
    throw new Error("the client update minimum app version is invalid");
  }
  if (
    !Number.isSafeInteger(manifest.expiresAt) ||
    manifest.expiresAt < 1
  ) {
    throw new Error("the client update expiry is invalid");
  }
  if (
    typeof manifest.bundleSha256 !== "string" ||
    !SHA256_PATTERN.test(manifest.bundleSha256)
  ) {
    throw new Error("the client update bundle hash is invalid");
  }

  return manifest;
}

export function validateBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("the client update bundle is not an object");
  }
  if (bundle.channel !== UPDATE_CHANNEL) {
    throw new Error(
      `the client update bundle belongs to ${bundle.channel ?? "no channel"}, expected ${UPDATE_CHANNEL}`,
    );
  }
  if (!isValidVersion(bundle.clientVersion)) {
    throw new Error("the bundled client version is invalid");
  }
  if (
    !Number.isSafeInteger(bundle.releaseSequence) ||
    bundle.releaseSequence < 1
  ) {
    throw new Error("the bundled release sequence is invalid");
  }
  if (bundle.bridgeApiVersion !== BRIDGE_API_VERSION) {
    throw new Error("the bundled bridge API is unsupported");
  }
  if (!isValidVersion(bundle.minAppVersion)) {
    throw new Error("the bundled minimum app version is invalid");
  }
  for (const key of ["preinject", "postinject", "minimumCss"]) {
    if (typeof bundle[key] !== "string" || bundle[key].length === 0) {
      throw new Error(`the bundled ${key} is empty`);
    }
  }

  return bundle;
}

export function verifyBundleMatchesManifest(bundle, manifest, bundleBytes) {
  validateBundle(bundle);
  validateManifest(manifest);

  if (bundle.clientVersion !== manifest.clientVersion) {
    throw new Error("the bundle and manifest client versions differ");
  }
  if (bundle.releaseSequence !== manifest.releaseSequence) {
    throw new Error("the bundle and manifest release sequences differ");
  }
  if (bundle.bridgeApiVersion !== manifest.bridgeApiVersion) {
    throw new Error("the bundle and manifest bridge versions differ");
  }
  if (bundle.minAppVersion !== manifest.minAppVersion) {
    throw new Error("the bundle and manifest minimum app versions differ");
  }
  if (sha256Hex(bundleBytes) !== manifest.bundleSha256) {
    throw new Error("the bundle does not match the manifest hash");
  }

  return bundle;
}

/**
 * Returns the next release sequence. Only published manifests may be passed
 * in; the caller is responsible for including the legacy stable manifest.
 */
export function nextReleaseSequence(manifests, requested) {
  const sequences = manifests
    .filter(Boolean)
    .map((manifest) => {
      if (
        !Number.isSafeInteger(manifest.releaseSequence) ||
        manifest.releaseSequence < 0
      ) {
        throw new Error("a previous manifest has an invalid release sequence");
      }
      return manifest.releaseSequence;
    });
  const previous = sequences.length > 0 ? Math.max(...sequences) : 0;

  if (requested === undefined || requested === null || requested === "") {
    return previous + 1;
  }

  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new Error("release_sequence must be a positive integer");
  }
  if (requested <= previous) {
    throw new Error(
      `release_sequence must exceed the published sequence ${previous}`,
    );
  }

  return requested;
}

export function createBundle({
  clientVersion,
  releaseSequence,
  minAppVersion,
  preinject,
  postinject,
  minimumCss,
}) {
  if (!isValidVersion(clientVersion)) {
    throw new Error("client_version must be a semantic version");
  }
  if (
    !Number.isSafeInteger(releaseSequence) ||
    releaseSequence < 1
  ) {
    throw new Error("release_sequence must be a positive integer");
  }
  if (!isValidVersion(minAppVersion)) {
    throw new Error("min_app_version must be a semantic version");
  }

  return {
    clientVersion,
    releaseSequence,
    bridgeApiVersion: BRIDGE_API_VERSION,
    minAppVersion,
    channel: UPDATE_CHANNEL,
    preinject,
    postinject,
    minimumCss,
  };
}

export function createManifest({ bundle, bundleSha256, expiresAt }) {
  const manifest = {
    clientVersion: bundle.clientVersion,
    releaseSequence: bundle.releaseSequence,
    bridgeApiVersion: bundle.bridgeApiVersion,
    minAppVersion: bundle.minAppVersion,
    channel: UPDATE_CHANNEL,
    expiresAt,
    bundleSha256,
  };

  return validateManifest(manifest);
}

function updatesUrl(baseUrl = DEFAULT_UPDATES_URL, relativePath) {
  return `${baseUrl.replace(/\/$/, "")}/${relativePath}`;
}

function outputPath(outputDir, relativePath, feedDir = "client-updates") {
  return join(outputDir, feedDir, relativePath);
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    redirect: "follow",
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Could not download ${url} (HTTP ${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchManifest(baseUrl, options = {}) {
  const { legacy = false } = options;
  const paths = legacy ? legacyStablePaths() : feedPaths();
  const bytes = await fetchBytes(updatesUrl(baseUrl, paths.manifest));
  if (bytes === null) {
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`The published ${paths.manifest} is not valid JSON`);
  }

  return {
    manifest: validateManifest(manifest, { allowLegacyStable: legacy }),
    bytes,
  };
}

async function previousManifests(baseUrl) {
  const published = [
    await fetchManifest(baseUrl),
    // The first release after the feed was versioned must still move past the
    // sequence that installations used before the migration.
    await fetchManifest(baseUrl, { legacy: true }),
  ];

  return published
    .filter(Boolean)
    .map((entry) => entry.manifest);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function defaultMinAppVersion(root) {
  const manifest = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
  const packageSection = manifest.slice(manifest.indexOf("[package]"));
  const match = packageSection.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("Could not read the app version from Cargo.toml");
  }
  return match[1];
}

export async function prepare(options) {
  const root = options.root ?? process.cwd();
  const clientVersion =
    options.clientVersion ??
    readJson(join(root, "client/version.json")).version;
  const minAppVersion =
    options.minAppVersion || defaultMinAppVersion(root);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = options.expiresAt ?? now + DEFAULT_MANIFEST_LIFETIME;
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt - now > MAX_MANIFEST_LIFETIME
  ) {
    throw new Error("expires_at must be within the next 90 days");
  }

  const previous = await previousManifests(
    options.baseUrl ?? DEFAULT_UPDATES_URL,
  );
  const releaseSequence = nextReleaseSequence(
    previous,
    options.releaseSequence,
  );
  const bundle = createBundle({
    clientVersion,
    releaseSequence,
    minAppVersion,
    preinject: readFileSync(
      options.preinjectPath ??
        join(root, "src-tauri/gen/injection/preinject.js"),
      "utf8",
    ),
    postinject: readFileSync(
      join(root, "src-tauri/gen/injection/postinject.js"),
      "utf8",
    ),
    minimumCss: readFileSync(
      join(root, "client/styles/minimum.css"),
      "utf8",
    ),
  });
  const bundleBytes = Buffer.from(JSON.stringify(bundle));
  const manifest = createManifest({
    bundle,
    bundleSha256: sha256Hex(bundleBytes),
    expiresAt,
  });
  const paths = feedPaths();
  const outputDir = resolve(root, options.outputDir ?? "web/dist");
  const feedDir = options.feedDir ?? "client-updates";

  for (const [relativePath, bytes] of [
    [paths.bundle, bundleBytes],
    [paths.manifest, Buffer.from(JSON.stringify(manifest))],
  ]) {
    const path = outputPath(outputDir, relativePath, feedDir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }

  return {
    clientVersion,
    releaseSequence,
    minAppVersion,
    expiresAt,
    bundleSha256: manifest.bundleSha256,
    manifestPath: outputPath(outputDir, paths.manifest, feedDir),
    signaturePath: outputPath(outputDir, paths.signature, feedDir),
  };
}

async function main() {
  const command = process.argv[2];
  const root = resolve(
    process.env.CLIENT_ROOT ||
      join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const baseUrl = process.env.CLIENT_UPDATES_URL || DEFAULT_UPDATES_URL;
  const outputDir = process.env.OUTPUT_DIR || "web/dist";
  const feedDir = process.env.CLIENT_UPDATES_DIR || "client-updates";

  if (command === "prepare") {
    const result = await prepare({
      root,
      outputDir,
      feedDir,
      baseUrl,
      clientVersion: process.env.CLIENT_VERSION || undefined,
      releaseSequence: process.env.RELEASE_SEQUENCE
        ? Number(process.env.RELEASE_SEQUENCE)
        : undefined,
      minAppVersion: process.env.MIN_APP_VERSION || undefined,
      expiresAt: process.env.EXPIRES_AT
        ? Number(process.env.EXPIRES_AT)
        : undefined,
      preinjectPath: process.env.PREINJECT_PATH || undefined,
    });

    console.log(`release_sequence=${result.releaseSequence}`);
    console.log(`bundle_sha256=${result.bundleSha256}`);
    console.log(`client_version=${result.clientVersion}`);
    console.log(`manifest_path=${result.manifestPath}`);
    console.log(`signature_path=${result.signaturePath}`);
    return;
  }

  throw new Error("Usage: node scripts/client-updates.mjs prepare");
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
