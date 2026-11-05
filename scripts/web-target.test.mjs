import assert from "node:assert/strict";
import { test } from "node:test";

import { createManifest } from "../client/targets/web/manifest.mjs";

test("the web manifest only runs on the exact Yapper origins", () => {
  const manifest = createManifest("1.2.3");

  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, [
      "https://yapin.gg/*",
      "https://www.yapin.gg/*",
    ]);
    assert.equal(script.run_at, "document_start");
    assert.equal(script.all_frames, false);
  }

  assert.equal(manifest.host_permissions[0], "https://yapin.gg/*");
  assert.equal(manifest.host_permissions[1], "https://www.yapin.gg/*");
});

test("the web manifest runs the client in the page and the bridge in isolation", () => {
  const manifest = createManifest("1.2.3");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(
    manifest.content_scripts.map((script) => [script.world, script.js]),
    [
      ["ISOLATED", ["bridge.js"]],
      ["MAIN", ["preinject.js"]],
    ],
  );
});

test("the web manifest carries its own identity and icons", () => {
  const manifest = createManifest("1.2.3");

  assert.equal(manifest.name, "Yapmod Web");
  assert.equal(manifest.short_name, "Yapmod");
  assert.equal(manifest.description.length <= 132, true);
  assert.deepEqual(manifest.icons, {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  });
});

test("the web manifest keeps privileged APIs inside the extension world", () => {
  const manifest = createManifest("1.2.3");

  assert.deepEqual(manifest.permissions, ["storage", "unlimitedStorage"]);
  assert.equal("web_accessible_resources" in manifest, false);
  assert.equal("scripting" in manifest.permissions, false);
  assert.equal(
    manifest.host_permissions.includes(
      "https://ilyeshdz.github.io/yapmod/community-plugins/*",
    ),
    true,
  );
});

test("the loader manifest reads the signed web feed", () => {
  const store = createManifest("1.2.3");
  const loader = createManifest("1.2.3", { loader: true });

  assert.equal(
    store.host_permissions.some((url) => url.includes("client-updates")),
    false,
  );
  assert.equal(
    loader.host_permissions.includes(
      "https://ilyeshdz.github.io/yapmod/client-updates-web/*",
    ),
    true,
  );
  assert.deepEqual(
    loader.content_scripts.map((script) => [script.world, script.js]),
    [
      ["ISOLATED", ["bridge.js"]],
      ["MAIN", ["loader.js"]],
    ],
  );
});
