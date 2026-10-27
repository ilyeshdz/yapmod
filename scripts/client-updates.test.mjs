import assert from "node:assert/strict";
import test from "node:test";

import {
  channelPaths,
  createBundle,
  createManifest,
  legacyStablePaths,
  nextReleaseSequence,
  sha256Hex,
  validateBundle,
  validateManifest,
  verifyBundleMatchesManifest,
} from "./client-updates.mjs";

function bundleFor(channel, overrides = {}) {
  return createBundle({
    channel,
    clientVersion: "1.2.3",
    releaseSequence: 4,
    minAppVersion: "0.5.0",
    preinject: "pre",
    postinject: "post",
    minimumCss: "css",
    ...overrides,
  });
}

function manifestFor(channel, bundle, overrides = {}) {
  return createManifest({
    channel,
    bundle,
    bundleSha256: "ab".repeat(32),
    expiresAt: 10_000,
    ...overrides,
  });
}

test("channels publish under distinct directories", () => {
  assert.deepEqual(channelPaths("stable"), {
    manifest: "stable/manifest.json",
    signature: "stable/manifest.sig",
    bundle: "stable/bundle.json",
  });
  assert.deepEqual(channelPaths("nightly"), {
    manifest: "nightly/manifest.json",
    signature: "nightly/manifest.sig",
    bundle: "nightly/bundle.json",
  });
  assert.deepEqual(legacyStablePaths(), {
    manifest: "manifest.json",
    signature: "manifest.sig",
    bundle: "bundle.json",
  });
  assert.throws(() => channelPaths("beta"), /Unknown update channel/);
});

test("manifests are validated against their channel", () => {
  const nightly = manifestFor("nightly", bundleFor("nightly"));
  assert.equal(nightly.channel, "nightly");
  assert.doesNotThrow(() => validateManifest(nightly, "nightly"));
  assert.throws(
    () => validateManifest(nightly, "stable"),
    /belongs to nightly, expected stable/,
  );

  const stable = manifestFor("stable", bundleFor("stable"));
  assert.throws(
    () => validateManifest(stable, "nightly"),
    /belongs to stable, expected nightly/,
  );
});

test("legacy stable manifests stay readable but never become nightly", () => {
  const legacy = manifestFor("stable", bundleFor("stable"));
  delete legacy.channel;

  assert.doesNotThrow(() =>
    validateManifest(legacy, "stable", { allowLegacyStable: true }),
  );
  assert.throws(
    () => validateManifest(legacy, "stable"),
    /belongs to no channel, expected stable/,
  );
  assert.throws(() =>
    validateManifest(legacy, "nightly", { allowLegacyStable: true }),
  );
});

test("release sequences advance independently per channel", () => {
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
  const bundle = bundleFor("stable");
  const bytes = Buffer.from(JSON.stringify(bundle));
  const manifest = createManifest({
    channel: "stable",
    bundle,
    bundleSha256: sha256Hex(bytes),
    expiresAt: 10_000,
  });

  assert.doesNotThrow(() =>
    verifyBundleMatchesManifest(bundle, manifest, "stable", bytes),
  );
  assert.throws(
    () =>
      verifyBundleMatchesManifest(
        bundle,
        manifest,
        "stable",
        Buffer.from(`${JSON.stringify(bundle)} `),
      ),
    /does not match the manifest hash/,
  );
});

test("a nightly bundle cannot satisfy a stable manifest", () => {
  const bundle = bundleFor("nightly");
  const bytes = Buffer.from(JSON.stringify(bundle));
  const manifest = createManifest({
    channel: "nightly",
    bundle,
    bundleSha256: sha256Hex(bytes),
    expiresAt: 10_000,
  });

  assert.doesNotThrow(() =>
    verifyBundleMatchesManifest(bundle, manifest, "nightly", bytes),
  );
  assert.throws(
    () => verifyBundleMatchesManifest(bundle, manifest, "stable", bytes),
    /belongs to nightly, expected stable/,
  );
});

test("bundle contents and version rules are checked", () => {
  assert.throws(
    () => bundleFor("stable", { clientVersion: "v1.2.3" }),
    /client_version must be a semantic version/,
  );
  assert.throws(
    () => bundleFor("stable", { minAppVersion: "latest" }),
    /min_app_version must be a semantic version/,
  );
  assert.throws(
    () => validateBundle(bundleFor("stable", { preinject: "" }), "stable"),
    /preinject is empty/,
  );
  assert.throws(
    () =>
      validateBundle(
        { ...bundleFor("stable"), channel: "nightly" },
        "stable",
      ),
    /belongs to nightly, expected stable/,
  );
});

test("manifests reject invalid hashes, versions and lifetimes", () => {
  const bundle = bundleFor("stable");
  assert.throws(
    () => manifestFor("stable", bundle, { bundleSha256: "nope" }),
    /bundle hash is invalid/,
  );
  assert.throws(
    () => manifestFor("stable", { ...bundle, clientVersion: "bad" }),
    /client update version is invalid/,
  );
});
