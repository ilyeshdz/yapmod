#!/usr/bin/env node
/**
 * Tauri updater manifest generator.
 *
 * Produces the `latest.json` format expected by Tauri's built-in updater,
 * signed with the repository's Ed25519 key. Each platform receives its own
 * manifest so the updater can fetch only the relevant download.
 *
 * Usage:
 *   node scripts/app-updates.mjs generate <version> <artifacts-dir> <output-dir>
 *
 * Environment variables:
 *   TAURI_SIGNING_PRIVATE_KEY       - PEM-encoded Ed25519 private key
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD - Password for the private key (optional)
 *   TAURI_UPDATER_PUBLIC_KEY        - Base64-encoded public key (for verification)
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const PLATFORMS = [
  {
    target: "x86_64-apple-darwin",
    patterns: ["yapmod_*_x64.dmg"],
    platform_key: "x86_64-apple-darwin",
  },
  {
    target: "aarch64-apple-darwin",
    patterns: ["yapmod_*_aarch64.dmg"],
    platform_key: "aarch64-apple-darwin",
  },
  {
    target: "x86_64-pc-windows-msvc",
    patterns: ["yapmod_*_x64-setup.exe"],
    platform_key: "x86_64-pc-windows-msvc",
  },
  {
    target: "x86_64-unknown-linux-gnu",
    patterns: ["yapmod_*_amd64.AppImage"],
    platform_key: "x86_64-unknown-linux-gnu",
  },
];

/** Compute SHA-256 hex digest of file contents. */
function sha256File(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/** Find a file matching any of the patterns in the given directory. */
function findArtifact(dir, patterns) {
  const files = readdirSync(dir);
  for (const file of files) {
    for (const pattern of patterns) {
      // Simple glob-like matching for patterns like "yapmod_*_x64.dmg"
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(file)) {
        return file;
      }
    }
  }
  return null;
}

/**
 * Generate Tauri updater manifests for all platforms.
 *
 * Each platform gets its own latest.json under app-updates/<target>/<version>/
 * so Tauri's endpoint template can resolve to the correct file.
 */
export function generate(version, artifactsDir, outputDir) {
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid version: ${version}`);
  }
  if (!artifactsDir) {
    throw new Error("artifacts directory is required");
  }
  if (!outputDir) {
    throw new Error("output directory is required");
  }

  const manifests = [];

  for (const platform of PLATFORMS) {
    const artifactName = findArtifact(artifactsDir, platform.patterns);
    if (!artifactName) {
      console.warn(
        `Skipping ${platform.target}: no artifact matching ${platform.patterns.join(", ")}`
      );
      continue;
    }

    const artifactPath = join(artifactsDir, artifactName);

    // Tauri v2 updater manifest format: platforms is an object keyed by OS-ARCH
    const osKey = platform.target.includes("darwin")
      ? "darwin"
      : platform.target.includes("windows")
        ? "windows"
        : "linux";
    const archKey = platform.target.split("-")[0];
    const platformKey = `${osKey}-${archKey}`;

    const manifest = {
      version: `v${version}`,
      notes: `Update to yapmod ${version}`,
      pub_date: new Date().toISOString(),
      platforms: {
        [platformKey]: {
          url: `https://github.com/ilyeshdz/yapmod/releases/download/v${version}/${artifactName}`,
        },
      },
    };

    // Write the manifest
    const platformOutputDir = join(
      outputDir,
      "app-updates",
      platform.target,
      version
    );
    mkdirSync(platformOutputDir, { recursive: true });
    const manifestPath = join(platformOutputDir, "latest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    manifests.push({
      platform: platform.target,
      artifact: artifactName,
      manifest: manifestPath,
    });

    console.log(
      `Generated manifest for ${platform.target}: ${artifactName}`
    );
  }

  if (manifests.length === 0) {
    console.error("No artifacts found for any platform");
    process.exit(1);
  }

  console.log(`Generated ${manifests.length} updater manifests`);
  return manifests;
}

/**
 * Sign a manifest using the Ed25519 private key and embed the signature
 * in the manifest's platform entries. Returns the base64-encoded signature.
 */
export function signManifest(manifestPath, privateKeyPem, password) {

  const keyFile = join(tmpdir(), `tauri-signer-key-${process.pid}.pem`);
  const sigFile = join(tmpdir(), `tauri-signer-sig-${process.pid}.sig`);

  try {
    // Write the private key to a temporary file
    writeFileSync(keyFile, privateKeyPem, { mode: 0o600 });

    // Sign the manifest JSON using openssl (Ed25519)
    const sigBuffer = execSync(
      `openssl pkeyutl -sign -rawin -inkey ${keyFile}${password ? ` -passin pass:${password}` : ""} -in ${manifestPath} -out ${sigFile} && cat ${sigFile}`
    );

    // Base64 encode the signature
    const signature = Buffer.from(sigBuffer).toString("base64");

    // Write the signature file next to the manifest
    writeFileSync(manifestPath + ".sig", signature);

    // Embed the signature in the manifest's platform entries (Tauri v2 requirement)
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    for (const platformKey of Object.keys(manifest.platforms)) {
      manifest.platforms[platformKey].signature = signature;
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return signature;
  } finally {
    // Clean up temporary files
    try {
      rmSync(keyFile);
      rmSync(sigFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// CLI entry point
const script = await import("node:url").then((m) =>
  m.fileURLToPath(import.meta.url)
);
const isMain =
  process.argv[1] === script || process.argv[1].endsWith("/app-updates.mjs");

if (isMain) {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "generate": {
      const [version, artifactsDir, outputDir] = args;
      if (!version || !artifactsDir || !outputDir) {
        console.error(
          "Usage: node scripts/app-updates.mjs generate <version> <artifacts-dir> <output-dir>"
        );
        process.exit(1);
      }

      const manifests = generate(version, artifactsDir, outputDir);

      // Sign each manifest if key is available
      const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
      const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;

      if (privateKey) {
        for (const m of manifests) {
          const sig = signManifest(m.manifest, privateKey, password);
          console.log(`Signed ${m.platform}: ${sig.slice(0, 32)}...`);
        }
      } else {
        console.warn(
          "TAURI_SIGNING_PRIVATE_KEY not set - manifests are unsigned"
        );
      }
      break;
    }
    default:
      console.error(
        "Usage: node scripts/app-updates.mjs <generate> [args...]"
      );
      process.exit(1);
  }
}
