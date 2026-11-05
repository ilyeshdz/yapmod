import assert from "node:assert/strict";
import { test } from "node:test";

import { createZip } from "./package-web-extension.mjs";

test("the web extension package is a zip with a root manifest", () => {
  const zip = createZip([
    { name: "manifest.json", bytes: Buffer.from('{"name":"Yapmod Web"}') },
    { name: "icons/icon-16.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ]);

  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
  assert.equal(zip.includes(Buffer.from("manifest.json")), true);
  assert.equal(zip.includes(Buffer.from("icons/icon-16.png")), true);
});
