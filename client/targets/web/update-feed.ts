/**
 * The signed web client feed.
 *
 * The desktop app and the self-hosted web loader consume separate feeds built
 * from the same client source. They are separate because each target compiles
 * its own host adapter into the bundle: a desktop preinject cannot run in a
 * browser page, and a web preinject cannot call Tauri commands.
 *
 * The envelope is the same as the desktop feed, so the signing key, the bridge
 * API version and the release sequence rules stay shared.
 */

declare const __YAPMOD_CLIENT_UPDATE_PUBLIC_KEY__: string;
declare const __YAPMOD_WEB_LOADER__: boolean;

export const WEB_LOADER = __YAPMOD_WEB_LOADER__;
export const UPDATE_PUBLIC_KEY = __YAPMOD_CLIENT_UPDATE_PUBLIC_KEY__;
export const UPDATE_BASE =
  "https://ilyeshdz.github.io/yapmod/client-updates-web/stable";
export const BRIDGE_API_VERSION = 1;

export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_SIGNATURE_BYTES = 1024;
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

const CLIENT_UPDATE_FILES = ["manifest.json", "manifest.sig", "bundle.json"];
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ClientUpdateManifest = {
  clientVersion: string;
  releaseSequence: number;
  bridgeApiVersion: number;
  minAppVersion: string;
  expiresAt: number;
  bundleSha256: string;
};

export type ClientUpdateBundle = {
  clientVersion: string;
  releaseSequence: number;
  bridgeApiVersion: number;
  minAppVersion: string;
  preinject: string;
  postinject?: string;
  minimumCss?: string;
};

export type ClientUpdateCheck = {
  currentVersion: string;
  latestVersion: string;
};

export function updateUrl(file: string): string {
  return `${UPDATE_BASE}/${file}`;
}

/** The background worker may only fetch the files of the signed feed. */
export function isUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.origin === new URL(UPDATE_BASE).origin &&
      url.href.startsWith(`${UPDATE_BASE}/`) &&
      CLIENT_UPDATE_FILES.includes(
        url.href.slice(`${UPDATE_BASE}/`.length),
      )
    );
  } catch {
    return false;
  }
}

export function runtimeUpdatesAvailable(): boolean {
  return WEB_LOADER && UPDATE_PUBLIC_KEY.length > 0;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", copyToArrayBuffer(bytes)),
  );

  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A plain numeric comparison; web shell versions have no prerelease part. */
function versionAtLeast(current: string, minimum: string): boolean {
  const left = current.split(".").map((part) => Number.parseInt(part, 10));
  const right = minimum.split(".").map((part) => Number.parseInt(part, 10));

  if (left.some((part) => !Number.isFinite(part))) {
    return false;
  }

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;

    if (a !== b) {
      return a > b;
    }
  }

  return true;
}

export async function verifyManifestSignature(
  manifestBytes: Uint8Array,
  signatureBase64: string,
  publicKeyBase64 = UPDATE_PUBLIC_KEY,
): Promise<void> {
  if (!publicKeyBase64) {
    throw new Error("this build has no client update public key");
  }

  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error("this browser cannot verify client updates");
  }

  const key = await subtle.importKey(
    "raw",
    copyToArrayBuffer(decodeBase64(publicKeyBase64)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await subtle.verify(
    "Ed25519",
    key,
    copyToArrayBuffer(decodeBase64(signatureBase64)),
    copyToArrayBuffer(manifestBytes),
  );

  if (!valid) {
    throw new Error("the client update signature is invalid");
  }
}

/**
 * Validates the decoded manifest against this shell, exactly like the desktop
 * app does before it stages a bundle.
 */
export function validateManifest(
  value: unknown,
  shellVersion: string,
  now = Date.now(),
): ClientUpdateManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("the client update manifest is not an object");
  }

  const manifest = value as Partial<ClientUpdateManifest>;

  if (
    typeof manifest.clientVersion !== "string" ||
    !VERSION_PATTERN.test(manifest.clientVersion)
  ) {
    throw new Error("the client update version is invalid");
  }
  if (
    !Number.isSafeInteger(manifest.releaseSequence) ||
    (manifest.releaseSequence ?? 0) < 1
  ) {
    throw new Error("the client update release sequence is invalid");
  }
  if (manifest.bridgeApiVersion !== BRIDGE_API_VERSION) {
    throw new Error("the client update bridge API is unsupported");
  }
  if (
    typeof manifest.minAppVersion !== "string" ||
    !VERSION_PATTERN.test(manifest.minAppVersion)
  ) {
    throw new Error("the client update minimum version is invalid");
  }
  if (
    !Number.isSafeInteger(manifest.expiresAt) ||
    (manifest.expiresAt ?? 0) * 1000 <= now
  ) {
    throw new Error("the client update has expired");
  }
  if (
    typeof manifest.bundleSha256 !== "string" ||
    !SHA256_PATTERN.test(manifest.bundleSha256)
  ) {
    throw new Error("the client update hash is invalid");
  }
  if (
    /^\d/.test(shellVersion) &&
    !versionAtLeast(shellVersion, manifest.minAppVersion)
  ) {
    throw new Error("the client update needs a newer extension");
  }

  return manifest as ClientUpdateManifest;
}

export async function parseAndVerifyManifest(
  manifestText: string,
  signatureBase64: string,
  shellVersion: string,
): Promise<ClientUpdateManifest> {
  const bytes = new TextEncoder().encode(manifestText);

  await verifyManifestSignature(bytes, signatureBase64);

  let value: unknown;

  try {
    value = JSON.parse(manifestText);
  } catch {
    throw new Error("the client update manifest is not valid JSON");
  }

  return validateManifest(value, shellVersion);
}

/** Checks that the bundle is the one the signed manifest describes. */
export async function verifyBundle(
  bundleText: string,
  manifest: ClientUpdateManifest,
): Promise<ClientUpdateBundle> {
  let value: unknown;

  try {
    value = JSON.parse(bundleText);
  } catch {
    throw new Error("the client update bundle is not valid JSON");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("the client update bundle is not an object");
  }

  const bundle = value as Partial<ClientUpdateBundle>;

  if (
    bundle.clientVersion !== manifest.clientVersion ||
    bundle.releaseSequence !== manifest.releaseSequence ||
    bundle.bridgeApiVersion !== manifest.bridgeApiVersion ||
    bundle.minAppVersion !== manifest.minAppVersion
  ) {
    throw new Error("the client update bundle does not match its manifest");
  }
  if (typeof bundle.preinject !== "string" || bundle.preinject.length === 0) {
    throw new Error("the client update bundle has no client code");
  }
  if ((await sha256Hex(new TextEncoder().encode(bundleText))) !== manifest.bundleSha256) {
    throw new Error("the client update bundle does not match its hash");
  }

  return bundle as ClientUpdateBundle;
}

/** Compares a candidate with the version the page is running. */
export function isNewer(candidate: string, current: string): boolean {
  if (candidate === current) {
    return false;
  }

  return versionAtLeast(candidate, current);
}
