import assert from "node:assert/strict";
import { test } from "node:test";

import { createManifest } from "../client/targets/web/manifest.mjs";

test("the web manifest only runs on the exact Yapper origins", () => {
  const manifest = createManifest("1.2.3");
  const script = manifest.content_scripts[0];

  assert.deepEqual(script.matches, [
    "https://yapin.gg/*",
    "https://www.yapin.gg/*",
  ]);
  assert.equal(script.run_at, "document_start");
  assert.equal(script.world, "ISOLATED");
  assert.equal(script.all_frames, false);
  assert.equal(manifest.host_permissions[0], "https://yapin.gg/*");
  assert.equal(manifest.host_permissions[1], "https://www.yapin.gg/*");
});

test("the web manifest carries the extension version and background worker", () => {
  const manifest = createManifest("1.2.3");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.content_scripts[0].js, ["preinject.js"]);
});

test("the web manifest grants no page-realm or plugin access", () => {
  const manifest = createManifest("1.2.3");

  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal("web_accessible_resources" in manifest, false);
  assert.equal("scripting" in manifest.permissions, false);
});
