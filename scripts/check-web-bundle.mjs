import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist", "web");
const clientVersion = JSON.parse(
  await readFile(join(root, "client", "version.json"), "utf8"),
).version;
const shellVersion = JSON.parse(
  await readFile(join(root, "client", "targets", "web", "version.json"), "utf8"),
).version;

const manifest = JSON.parse(
  await readFile(join(outdir, "manifest.json"), "utf8"),
);
const preinject = await readFile(join(outdir, "preinject.js"), "utf8");
const bridge = await readFile(join(outdir, "bridge.js"), "utf8");
const background = await readFile(join(outdir, "background.js"), "utf8");

assert.equal(manifest.name, "Yapmod Web");
assert.equal(manifest.short_name, "Yapmod");
assert.equal(
  manifest.description.length <= 132,
  true,
  "the manifest description must fit the browser limit",
);
assert.equal(manifest.version, shellVersion, "the manifest version must match the web shell version");
assert.equal(manifest.manifest_version, 3);
assert.equal(
  bridge.includes(clientVersion),
  true,
  "the bridge must report the injected client version",
);

// Every icon the manifest points at must be a real PNG in the build output.
for (const [size, path] of Object.entries(manifest.icons)) {
  const bytes = await readFile(join(outdir, path));

  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `the ${size}px icon must be a PNG`,
  );
}
assert.deepEqual(
  manifest.content_scripts.map((script) => [script.world, script.js]),
  [
    ["ISOLATED", ["bridge.js"]],
    ["MAIN", ["preinject.js"]],
  ],
  "the privileged bridge must be isolated and the client must run in the page realm",
);
for (const script of manifest.content_scripts) {
  assert.equal(script.all_frames, false);
}
assert.equal(manifest.background.service_worker, "background.js");

// The web bundles must not reach the Tauri bridge that only the desktop target
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

for (const [name, source] of [
  ["preinject", preinject],
  ["bridge", bridge],
]) {
  for (const marker of forbidden) {
    assert.equal(
      source.includes(marker),
      false,
      `the ${name} bundle must not contain ${marker}`,
    );
  }
}

assert.equal(
  background.includes("yapmod:fetch-catalog-text"),
  true,
  "the background worker must expose the catalog fetch bridge",
);
assert.equal(
  bridge.includes("yapmod:fetch-catalog-text"),
  true,
  "the isolated bridge must use the catalog fetch bridge",
);
assert.equal(
  preinject.includes("yapmod:fetch-catalog-text"),
  false,
  "the page realm must not fetch catalogs directly",
);
assert.equal(
  background.includes("community-plugins"),
  true,
  "the background worker must allow the plugin catalog",
);
assert.equal(
  bridge.includes("community-plugins"),
  true,
  "the isolated bridge must know the plugin catalog",
);
assert.equal(
  bridge.includes("yapmod:plugins"),
  true,
  "the isolated bridge must store plugin packages",
);
assert.equal(
  bridge.includes("yapmod:themes"),
  true,
  "the isolated bridge must store theme packages",
);
assert.equal(
  bridge.includes("themes:storeBundle"),
  true,
  "the isolated bridge must accept imported themes",
);
assert.equal(
  preinject.includes("themes:storeBundle"),
  true,
  "the page realm must send imported themes to the bridge",
);
assert.equal(
  preinject.includes("yapmod:bridge-connect"),
  true,
  "the page realm must connect to the isolated bridge",
);

console.log("web bundle checks passed");
