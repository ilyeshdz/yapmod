import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist", "web");
const version = JSON.parse(
  await readFile(join(root, "client", "version.json"), "utf8"),
).version;

const manifest = JSON.parse(
  await readFile(join(outdir, "manifest.json"), "utf8"),
);
const preinject = await readFile(join(outdir, "preinject.js"), "utf8");
const background = await readFile(join(outdir, "background.js"), "utf8");

assert.equal(manifest.version, version, "the manifest version must match client/version.json");
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.content_scripts[0].world, "ISOLATED");
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal(manifest.background.service_worker, "background.js");

// The web bundle must not reach the Tauri bridge that only the desktop target
// provides.
const forbidden = [
  "__TAURI_INTERNALS__",
  "plugin:opener",
  "set_settings",
  "set_badge_count",
  "get_changelog",
  "prepare_client_update",
  "restart_app",
];

for (const marker of forbidden) {
  assert.equal(
    preinject.includes(marker),
    false,
    `the web bundle must not contain ${marker}`,
  );
}

assert.equal(
  background.includes("yapmod:fetch-catalog-text"),
  true,
  "the background worker must expose the catalog fetch bridge",
);
assert.equal(
  preinject.includes("yapmod:fetch-catalog-text"),
  true,
  "the content script must use the catalog fetch bridge",
);
assert.equal(
  background.includes("community-plugins"),
  true,
  "the background worker must allow the plugin catalog",
);
assert.equal(
  preinject.includes("community-plugins"),
  true,
  "the content script must know the plugin catalog",
);
assert.equal(
  preinject.includes("yapmod:plugins"),
  true,
  "the content script must store plugin packages",
);

console.log("web bundle checks passed");
