#!/usr/bin/env node
/**
 * Channel-aware client update manifest tooling.
 *
 * Stable and nightly releases each have their own directory below
 * `client-updates/`, their own release sequence and their own manifest. The
 * legacy stable paths are still written for installations built before
 * channels existed.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHANNELS = Object.freeze(["stable", "nightly"]);
export const BRIDGE_API_VERSION = 1;
export const DEFAULT_UPDATES_URL =
  "https://ilyeshdz.github.io/yapmod/client-updates";
export const MAX_MANIFEST_LIFETIME = 90 * 24 * 60 * 60;
export const DEFAULT_MANIFEST_LIFETIME = 60 * 24 * 60 * 60;

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Files published for one channel, relative to the client-updates root. */
export function channelPaths(channel) {
  assertChannel(channel);

  return {
    manifest: `${channel}/manifest.json`,
    signature: `${channel}/manifest.sig`,
    bundle: `${channel}/bundle.json`,
  };
}

/** Stable aliases consumed by installations from before channel isolation. */
export function legacyStablePaths() {
  return {
    manifest: "manifest.json",
    signature: "manifest.sig",
    bundle: "bundle.json",
  };
}

export function assertChannel(channel) {
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Unknown update channel: ${channel}`);
  }
  return channel;
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

export function validateManifest(manifest, expectedChannel, options = {}) {
  const { allowLegacyStable = false } = options;

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("the client update manifest is not an object");
  }
  if (allowLegacyStable) {
    if (expectedChannel !== "stable") {
      throw new Error("legacy manifests are only valid for the stable channel");
    }
    if (
      manifest.channel !== undefined &&
      manifest.channel !== "stable"
    ) {
      throw new Error("the legacy manifest belongs to another channel");
    }
  } else if (manifest.channel !== expectedChannel) {
    throw new Error(
      `the client update manifest belongs to ${manifest.channel ?? "no channel"}, expected ${expectedChannel}`,
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

export function validateBundle(bundle, expectedChannel) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("the client update bundle is not an object");
  }
  if (bundle.channel !== expectedChannel) {
    throw new Error(
      `the client update bundle belongs to ${bundle.channel ?? "no channel"}, expected ${expectedChannel}`,
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

export function verifyBundleMatchesManifest(
  bundle,
  manifest,
  expectedChannel,
  bundleBytes,
) {
  validateBundle(bundle, expectedChannel);
  validateManifest(manifest, expectedChannel);

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
 * Returns the next sequence for a channel. Only manifests from that channel
 * may be passed in; the caller is responsible for keeping the lists separate.
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
  channel,
  clientVersion,
  releaseSequence,
  minAppVersion,
  preinject,
  postinject,
  minimumCss,
}) {
  assertChannel(channel);
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
    channel,
    preinject,
    postinject,
    minimumCss,
  };
}

export function createManifest({
  channel,
  bundle,
  bundleSha256,
  expiresAt,
}) {
  assertChannel(channel);
  const manifest = {
    clientVersion: bundle.clientVersion,
    releaseSequence: bundle.releaseSequence,
    bridgeApiVersion: bundle.bridgeApiVersion,
    minAppVersion: bundle.minAppVersion,
    channel,
    expiresAt,
    bundleSha256,
  };

  return validateManifest(manifest, channel);
}

function updatesUrl(baseUrl = DEFAULT_UPDATES_URL, relativePath) {
  return `${baseUrl.replace(/\/$/, "")}/${relativePath}`;
}

function outputPath(outputDir, relativePath) {
  return join(outputDir, "client-updates", relativePath);
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

async function fetchManifest(baseUrl, channel, options = {}) {
  const { legacy = false } = options;
  const paths = legacy ? legacyStablePaths() : channelPaths(channel);
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
    manifest: validateManifest(manifest, channel, {
      allowLegacyStable: legacy,
    }),
    bytes,
  };
}

async function previousManifests(baseUrl, channel) {
  const published = [await fetchManifest(baseUrl, channel)];

  // The first stable release after channels exist must still move past the
  // sequence that installations used before the migration.
  if (channel === "stable") {
    published.push(
      await fetchManifest(baseUrl, channel, { legacy: true }),
    );
  }

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

function nonEmpty(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export async function prepare(options) {
  const root = options.root ?? process.cwd();
  const channel = assertChannel(options.channel);
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
    channel,
  );
  const releaseSequence = nextReleaseSequence(
    previous,
    options.releaseSequence,
  );
  const bundle = createBundle({
    channel,
    clientVersion,
    releaseSequence,
    minAppVersion,
    preinject: readFileSync(
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
    channel,
    bundle,
    bundleSha256: sha256Hex(bundleBytes),
    expiresAt,
  });
  const paths = channelPaths(channel);
  const outputDir = resolve(root, options.outputDir ?? "web/dist");

  for (const [relativePath, bytes] of [
    [paths.bundle, bundleBytes],
    [paths.manifest, Buffer.from(JSON.stringify(manifest))],
  ]) {
    const path = outputPath(outputDir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }

  return {
    channel,
    clientVersion,
    releaseSequence,
    minAppVersion,
    expiresAt,
    bundleSha256: manifest.bundleSha256,
    manifestPath: outputPath(outputDir, paths.manifest),
    signaturePath: outputPath(outputDir, paths.signature),
  };
}

async function preserveChannel(baseUrl, channel, outputDir) {
  const paths = channelPaths(channel);
  const published = await fetchManifest(baseUrl, channel);
  if (!published) {
    console.log(`No published ${channel} client update to preserve.`);
    return;
  }
  const { manifest, bytes: manifestBytes } = published;
  const signature = await fetchBytes(updatesUrl(baseUrl, paths.signature));
  const bundleBytes = await fetchBytes(updatesUrl(baseUrl, paths.bundle));
  if (signature === null || bundleBytes === null) {
    throw new Error(`The published ${channel} client update is incomplete`);
  }

  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString("utf8"));
  } catch {
    throw new Error(`The published ${paths.bundle} is not valid JSON`);
  }
  verifyBundleMatchesManifest(bundle, manifest, channel, bundleBytes);

  for (const [relativePath, bytes] of [
    [paths.manifest, manifestBytes],
    [paths.signature, signature],
    [paths.bundle, bundleBytes],
  ]) {
    const path = outputPath(outputDir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}

async function preserveLegacyStable(baseUrl, outputDir) {
  const paths = legacyStablePaths();
  const published = await fetchManifest(baseUrl, "stable", { legacy: true });
  if (!published) {
    return;
  }
  const { manifest, bytes: manifestBytes } = published;
  const signature = await fetchBytes(updatesUrl(baseUrl, paths.signature));
  const bundleBytes = await fetchBytes(updatesUrl(baseUrl, paths.bundle));
  if (signature === null || bundleBytes === null) {
    throw new Error("The legacy stable client update is incomplete");
  }

  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString("utf8"));
  } catch {
    throw new Error(`The published ${paths.bundle} is not valid JSON`);
  }
  // Older stable bundles predate the channel field.
  if (bundle.channel !== undefined && bundle.channel !== "stable") {
    throw new Error("The legacy stable bundle belongs to another channel");
  }
  validateBundle({ ...bundle, channel: "stable" }, "stable");
  if (sha256Hex(bundleBytes) !== manifest.bundleSha256) {
    throw new Error("The legacy stable bundle does not match its manifest");
  }

  for (const [relativePath, bytes] of [
    [paths.manifest, manifestBytes],
    [paths.signature, signature],
    [paths.bundle, bundleBytes],
  ]) {
    const path = outputPath(outputDir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}

export async function preserve(options = {}) {
  const root = options.root ?? process.cwd();
  const baseUrl = options.baseUrl ?? DEFAULT_UPDATES_URL;
  const outputDir = resolve(root, options.outputDir ?? "web/dist");
  const skipChannel = options.skipChannel
    ? assertChannel(options.skipChannel)
    : null;

  for (const channel of CHANNELS) {
    if (channel !== skipChannel) {
      await preserveChannel(baseUrl, channel, outputDir);
    }
  }
  if (skipChannel !== "stable") {
    await preserveLegacyStable(baseUrl, outputDir);
  }
}

async function main() {
  const command = process.argv[2];
  const root = resolve(
    process.env.CLIENT_ROOT ||
      join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const baseUrl = process.env.CLIENT_UPDATES_URL || DEFAULT_UPDATES_URL;
  const outputDir = process.env.OUTPUT_DIR || "web/dist";

  if (command === "prepare") {
    const result = await prepare({
      root,
      outputDir,
      baseUrl,
      channel: nonEmpty("CHANNEL", process.env.CHANNEL),
      clientVersion: process.env.CLIENT_VERSION || undefined,
      releaseSequence: process.env.RELEASE_SEQUENCE
        ? Number(process.env.RELEASE_SEQUENCE)
        : undefined,
      minAppVersion: process.env.MIN_APP_VERSION || undefined,
      expiresAt: process.env.EXPIRES_AT
        ? Number(process.env.EXPIRES_AT)
        : undefined,
    });

    console.log(`release_sequence=${result.releaseSequence}`);
    console.log(`bundle_sha256=${result.bundleSha256}`);
    console.log(`client_version=${result.clientVersion}`);
    console.log(`manifest_path=${result.manifestPath}`);
    console.log(`signature_path=${result.signaturePath}`);
    return;
  }

  if (command === "preserve") {
    await preserve({
      root,
      outputDir,
      baseUrl,
      skipChannel: process.env.SKIP_CHANNEL || undefined,
    });
    return;
  }

  throw new Error("Usage: node scripts/client-updates.mjs <prepare|preserve>");
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
