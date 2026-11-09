import assert from "node:assert/strict";
import test from "node:test";

import {
  feedPaths,
  createBundle,
  createManifest,
  legacyStablePaths,
  nextReleaseSequence,
  sha256Hex,
  UPDATE_CHANNEL,
  validateBundle,
  validateManifest,
  verifyBundleMatchesManifest,
} from "./client-updates.mjs";

function bundleFor(overrides = {}) {
  return createBundle({
    clientVersion: "1.2.3",
    releaseSequence: 4,
    minAppVersion: "0.5.0",
    preinject: "pre",
    postinject: "post",
    minimumCss: "css",
    ...overrides,
  });
}

function manifestFor(bundle, overrides = {}) {
  return createManifest({
    bundle,
    bundleSha256: "ab".repeat(32),
    expiresAt: 10_000,
    ...overrides,
  });
}

test("the feed publishes under one directory", () => {
  assert.equal(UPDATE_CHANNEL, "stable");
  assert.deepEqual(feedPaths(), {
    manifest: "stable/manifest.json",
    signature: "stable/manifest.sig",
    bundle: "stable/bundle.json",
  });
  assert.deepEqual(legacyStablePaths(), {
    manifest: "manifest.json",
    signature: "manifest.sig",
    bundle: "bundle.json",
  });
});

test("manifests are validated against the single channel", () => {
  const manifest = manifestFor(bundleFor());
  assert.equal(manifest.channel, UPDATE_CHANNEL);
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.throws(
    () => validateManifest({ ...manifest, channel: "nightly" }),
    /belongs to nightly, expected stable/,
  );
});

test("legacy stable manifests stay readable", () => {
  const legacy = manifestFor(bundleFor());
  delete legacy.channel;

  assert.doesNotThrow(() =>
    validateManifest(legacy, { allowLegacyStable: true }),
  );
  assert.throws(
    () => validateManifest(legacy),
    /belongs to no channel, expected stable/,
  );
});

test("release sequences advance from the published feed", () => {
  assert.equal(nextReleaseSequence([], undefined), 1);
  assert.equal(
    nextReleaseSequence([{ releaseSequence: 11 }], undefined),
    12,
  );
  assert.equal(
    nextReleaseSequence([{ releaseSequence: 11 }], 20),
    20,
  );
  assert.throws(
    () => nextReleaseSequence([{ releaseSequence: 11 }], 11),
    /must exceed the published sequence 11/,
  );
});

test("a manifest hash binds the exact bundle bytes", () => {
  const bundle = bundleFor();
  const bytes = Buffer.from(JSON.stringify(bundle));
  const manifest = createManifest({
    bundle,
    bundleSha256: sha256Hex(bytes),
    expiresAt: 10_000,
  });

  assert.doesNotThrow(() =>
    verifyBundleMatchesManifest(bundle, manifest, bytes),
  );
  assert.throws(
    () =>
      verifyBundleMatchesManifest(
        bundle,
        manifest,
        Buffer.from(`${JSON.stringify(bundle)} `),
      ),
    /does not match the manifest hash/,
  );
});

test("bundle contents and version rules are checked", () => {
  assert.throws(
    () => bundleFor({ clientVersion: "v1.2.3" }),
    /client_version must be a semantic version/,
  );
  assert.throws(
    () => bundleFor({ minAppVersion: "latest" }),
    /min_app_version must be a semantic version/,
  );
  assert.throws(
    () => validateBundle(bundleFor({ preinject: "" })),
    /preinject is empty/,
  );
  assert.throws(
    () => validateBundle({ ...bundleFor(), channel: "nightly" }),
    /belongs to nightly, expected stable/,
  );
});

test("manifests reject invalid hashes, versions and lifetimes", () => {
  const bundle = bundleFor();
  assert.throws(
    () => manifestFor(bundle, { bundleSha256: "nope" }),
    /bundle hash is invalid/,
  );
  assert.throws(
    () => manifestFor({ ...bundle, clientVersion: "bad" }),
    /client update version is invalid/,
  );
});
