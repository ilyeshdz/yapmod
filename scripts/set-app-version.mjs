import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.APP_VERSION ?? process.argv[2];

if (
  !version ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
) {
  throw new Error("Set APP_VERSION or pass a valid semantic version as the first argument.");
}

const manifestPath = "src-tauri/Cargo.toml";
const lockPath = "src-tauri/Cargo.lock";
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
  throw new Error(`Expected one yapmod package entry in ${lockPath}, found ${lockMatches}.`);
}

writeFileSync(manifestPath, updatedManifest);
writeFileSync(lockPath, updatedLock);
