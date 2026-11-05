import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientVersion = JSON.parse(
  await readFile(join(root, "client", "version.json"), "utf8"),
).version;
const shellVersion = JSON.parse(
  await readFile(join(root, "client", "targets", "web", "version.json"), "utf8"),
).version;

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

async function readBuild(directory, pageFile) {
  const outdir = join(root, "dist", directory);
  const manifest = JSON.parse(
    await readFile(join(outdir, "manifest.json"), "utf8"),
  );
  const bridge = await readFile(join(outdir, "bridge.js"), "utf8");
  const background = await readFile(join(outdir, "background.js"), "utf8");
  const preinject = await readFile(join(outdir, pageFile), "utf8");

  return { outdir, manifest, bridge, background, preinject };
}

async function checkCommon(name, build, pageScript) {
  const { outdir, manifest, bridge, background } = build;

  assert.equal(manifest.name, "Yapmod Web", `${name}: name`);
  assert.equal(manifest.short_name, "Yapmod", `${name}: short name`);
  assert.equal(
    manifest.description.length <= 132,
    true,
    `${name}: the manifest description must fit the browser limit`,
  );
  assert.equal(
    manifest.version,
    shellVersion,
    `${name}: the manifest version must match the web shell version`,
  );
  assert.equal(manifest.manifest_version, 3, `${name}: manifest version`);
  assert.equal(
    bridge.includes(clientVersion),
    true,
    `${name}: the bridge must report the injected client version`,
  );

  // Every icon the manifest points at must be a real PNG in the build output.
  for (const [size, path] of Object.entries(manifest.icons)) {
    const bytes = await readFile(join(outdir, path));

    assert.equal(
      bytes.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      `${name}: the ${size}px icon must be a PNG`,
    );
  }

  assert.deepEqual(
    manifest.content_scripts.map((script) => [script.world, script.js]),
    [
      ["ISOLATED", ["bridge.js"]],
      ["MAIN", [pageScript]],
    ],
    `${name}: the privileged bridge must be isolated and the client must run in the page realm`,
  );

  for (const script of manifest.content_scripts) {
    assert.equal(script.all_frames, false, `${name}: all_frames`);
  }

  assert.equal(
    manifest.background.service_worker,
    "background.js",
    `${name}: background worker`,
  );

  return { manifest, bridge, background };
}

function checkCatalogWiring(name, { bridge, background, preinject }) {
  for (const [file, source] of [
    ["bridge", bridge],
    ["background", background],
    ...(preinject ? [["preinject", preinject]] : []),
  ]) {
    for (const marker of forbidden) {
      assert.equal(
        source.includes(marker),
        false,
        `${name}: the ${file} bundle must not contain ${marker}`,
      );
    }
  }

  assert.equal(
    background.includes("yapmod:fetch-catalog-text"),
    true,
    `${name}: the background worker must expose the fetch bridge`,
  );
  assert.equal(
    bridge.includes("yapmod:fetch-catalog-text"),
    true,
    `${name}: the isolated bridge must use the fetch bridge`,
  );
  assert.equal(
    background.includes("community-plugins"),
    true,
    `${name}: the background worker must allow the plugin catalog`,
  );
  assert.equal(
    bridge.includes("community-plugins"),
    true,
    `${name}: the isolated bridge must know the plugin catalog`,
  );
  assert.equal(
    bridge.includes("yapmod:plugins"),
    true,
    `${name}: the isolated bridge must store plugin packages`,
  );
  assert.equal(
    bridge.includes("yapmod:themes"),
    true,
    `${name}: the isolated bridge must store theme packages`,
  );
  assert.equal(
    bridge.includes("themes:storeBundle"),
    true,
    `${name}: the isolated bridge must accept imported themes`,
  );
}

const store = await readBuild("web", "preinject.js");
await checkCommon("store", store, "preinject.js");
checkCatalogWiring("store", store);

assert.equal(
  store.preinject.includes("themes:storeBundle"),
  true,
  "store: the page realm must send imported themes to the bridge",
);
assert.equal(
  store.preinject.includes("yapmod:bridge-connect"),
  true,
  "store: the page realm must connect to the isolated bridge",
);
assert.equal(
  store.preinject.includes("yapmod:fetch-catalog-text"),
  false,
  "store: the page realm must not fetch catalogs directly",
);
assert.equal(
  store.manifest.host_permissions.some((url) => url.includes("client-updates")),
  false,
  "store: the store build must not request the update feed",
);

const loader = await readBuild("web-loader", "loader.js");
const { manifest: loaderManifest } = await checkCommon(
  "loader",
  loader,
  "loader.js",
);
checkCatalogWiring("loader", loader);

assert.equal(
  loaderManifest.host_permissions.includes(
    "https://ilyeshdz.github.io/yapmod/client-updates-web/*",
  ),
  true,
  "loader: the loader build must request the web update feed",
);
assert.equal(
  loader.bridge.includes("client-updates-web"),
  true,
  "loader: the bridge must read the web update feed",
);
assert.equal(
  loader.background.includes("client-updates-web"),
  true,
  "loader: the background worker must allow the web update feed",
);

const loaderScript = loader.preinject;
assert.equal(
  loaderScript.includes(clientVersion),
  true,
  "loader: the embedded client must report the injected client version",
);
assert.equal(
  loaderScript.includes("yapmod:client-bundle"),
  true,
  "loader: the loader must read the staged client cache",
);

console.log("web bundle checks passed");
