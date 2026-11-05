import type {
  CommunityPlugin,
  PluginBundle,
  PluginManifest,
} from "../../shared/types";
import {
  PLUGIN_API,
  PLUGIN_CATALOG_BASE,
  MAX_CATALOG_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_PLUGIN_CSS_BYTES,
  MAX_PLUGIN_SCRIPT_BYTES,
} from "./catalog";
import { pickDirectory, pickFile } from "./dialogs";
import { fetchCatalogJson, fetchCatalogText } from "./fetch";
import {
  samePluginManifest,
  validatePluginBundle,
  validatePluginManifest,
} from "../../features/plugins/package";
import {
  readStoredPlugins,
  removeStoredPluginData,
  writeStoredPlugins,
} from "./storage";

/**
 * Community plugin installation for the browser extension.
 *
 * Plugins are plain data in extension storage. The content script runs their
 * optional script in the extension's isolated world, so a plugin can change
 * the page DOM but cannot patch page JavaScript.
 */

const MAX_PLUGIN_FILE_BYTES = 8 * 1024 * 1024;
const MANIFEST_FILE = "manifest.json";
const CSS_FILE = "plugin.css";
const SCRIPT_FILE = "plugin.js";

type CatalogEntry = PluginManifest & { verified?: boolean };
type Catalog = { api: number; plugins: CatalogEntry[] };

type PickedPlugin = {
  manifest: PluginManifest;
  css: File;
  script: File | null;
};

let pickedPlugin: PickedPlugin | null = null;

function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,23}$/i.test(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Adds the defaults the Rust side applies when it reads a manifest, then
 * validates the result with the same checks every target uses.
 *
 * The object is rebuilt field by field because catalog entries also carry a
 * `verified` flag that is not part of the manifest. Keeping it would make a
 * verified catalog entry differ from the downloaded manifest.
 */
function normalizeManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new Error("The plugin manifest must be an object.");
  }

  const version = optionalString(value.version);
  const author = optionalString(value.author);
  const description = optionalString(value.description);
  const license = optionalString(value.license);
  const script = optionalString(value.script);
  const manifest: PluginManifest = {
    id: value.id as string,
    name: value.name as string,
    ...(version === undefined ? {} : { version }),
    ...(author === undefined ? {} : { author }),
    ...(description === undefined ? {} : { description }),
    ...(license === undefined ? {} : { license }),
    api: value.api as 1,
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    settings: Array.isArray(value.settings)
      ? (value.settings as PluginManifest["settings"])
      : [],
    stylesheet: optionalString(value.stylesheet) ?? CSS_FILE,
    ...(script === undefined ? {} : { script }),
  };

  validatePluginManifest(manifest);

  return manifest;
}

async function readTextFile(file: File, maxBytes: number, label: string): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`The plugin ${label} is larger than the allowed size.`);
  }

  return file.text();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("The selected file could not be read."));
        return;
      }

      resolve(
        file.type
          ? result
          : result.replace(/^data:[^;,]*/, "data:application/octet-stream"),
      );
    });
    reader.addEventListener("error", () => {
      reject(new Error("The selected file could not be read."));
    });
    reader.readAsDataURL(file);
  });
}

async function fetchCatalog(): Promise<Catalog> {
  const catalog = await fetchCatalogJson<Catalog>(
    `${PLUGIN_CATALOG_BASE}/index.json`,
    MAX_CATALOG_BYTES,
  );

  if (typeof catalog?.api !== "number" || catalog.api > PLUGIN_API) {
    throw new Error("the community plugin catalog needs a newer plugin API");
  }

  if (!Array.isArray(catalog.plugins)) {
    throw new Error("the community plugin catalog is invalid");
  }

  return catalog;
}

async function fetchCommunityManifest(
  id: string,
): Promise<{ manifest: PluginManifest; verified: boolean }> {
  if (!isValidId(id)) {
    throw new Error("that is not a valid plugin id");
  }

  const catalog = await fetchCatalog();
  const entry = catalog.plugins.find((plugin) => plugin?.id === id);

  if (!entry) {
    throw new Error("that plugin is not in the community catalog");
  }

  const expected = normalizeManifest(entry);
  const manifest = normalizeManifest(
    JSON.parse(
      await fetchCatalogText(
        `${PLUGIN_CATALOG_BASE}/plugins/${id}/${MANIFEST_FILE}`,
        MAX_MANIFEST_BYTES,
      ),
    ),
  );

  if (manifest.id !== id || !samePluginManifest(manifest, expected)) {
    throw new Error("the community plugin id does not match the catalog");
  }

  return { manifest, verified: entry.verified === true };
}

/** The community catalog, filtered to plugins this client understands. */
export async function listCommunityPlugins(): Promise<CommunityPlugin[]> {
  const catalog = await fetchCatalog();
  const plugins: CommunityPlugin[] = [];

  for (const entry of catalog.plugins) {
    try {
      const manifest = normalizeManifest(entry);

      if (manifest.api === PLUGIN_API) {
        plugins.push({
          ...manifest,
          tags: manifest.tags ?? [],
          settings: manifest.settings ?? [],
          stylesheet: manifest.stylesheet,
          verified: entry.verified === true,
        });
      }
    } catch {
      // A catalog entry this client cannot validate is simply not listed.
    }
  }

  return plugins.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export async function previewCommunityPlugin(
  id: string,
): Promise<PluginManifest> {
  return (await fetchCommunityManifest(id)).manifest;
}

export async function installCommunityPlugin(
  id: string,
  expectedManifest: PluginManifest,
): Promise<PluginBundle> {
  const { manifest, verified } = await fetchCommunityManifest(id);

  if (!samePluginManifest(manifest, expectedManifest)) {
    throw new Error(
      "the community plugin changed after you reviewed its import warning",
    );
  }

  const installed = await readStoredPlugins();

  if (installed.some((plugin) => plugin.manifest.id === id)) {
    throw new Error("a plugin with this id is already installed; remove it first");
  }

  const css = await fetchCatalogText(
    `${PLUGIN_CATALOG_BASE}/plugins/${id}/${manifest.stylesheet ?? CSS_FILE}`,
    MAX_PLUGIN_CSS_BYTES,
  );
  const script = manifest.script
    ? await fetchCatalogText(
        `${PLUGIN_CATALOG_BASE}/plugins/${id}/${manifest.script}`,
        MAX_PLUGIN_SCRIPT_BYTES,
      )
    : null;
  const bundle: PluginBundle = { manifest, css, script, verified };

  validatePluginBundle(bundle);
  await writeStoredPlugins([...installed, bundle]);

  return bundle;
}

/**
 * Reads a plugin folder selected with the browser's directory picker.
 *
 * The manifest is returned first so the shared client can show its consent
 * dialog. `installPickedPlugin` then reads the two package files it contains.
 */
export async function pickLocalPlugin(): Promise<PluginManifest | null> {
  pickedPlugin = null;

  const directory = await pickDirectory();

  if (!directory) {
    return null;
  }

  const manifestFile = directory.files.get(MANIFEST_FILE);

  if (!manifestFile) {
    throw new Error("The selected folder has no manifest.json.");
  }

  const manifest = normalizeManifest(
    JSON.parse(
      await readTextFile(manifestFile, MAX_MANIFEST_BYTES, "manifest"),
    ),
  );
  const cssFile = directory.files.get(manifest.stylesheet ?? CSS_FILE);

  if (!cssFile) {
    throw new Error(`The selected folder has no ${CSS_FILE}.`);
  }

  const scriptFile = manifest.script
    ? (directory.files.get(manifest.script) ?? null)
    : null;

  if (manifest.script && !scriptFile) {
    throw new Error(`The selected folder has no ${SCRIPT_FILE}.`);
  }

  for (const file of [cssFile, scriptFile]) {
    if (file && file.size > MAX_PLUGIN_SCRIPT_BYTES) {
      throw new Error("A plugin file is larger than the allowed size.");
    }
  }

  pickedPlugin = { manifest, css: cssFile, script: scriptFile };

  return manifest;
}

export async function installPickedPlugin(
  expectedManifest: PluginManifest,
): Promise<PluginBundle> {
  const picked = pickedPlugin;

  pickedPlugin = null;

  if (!picked) {
    throw new Error("Choose a plugin folder before importing it.");
  }

  if (!samePluginManifest(picked.manifest, expectedManifest)) {
    throw new Error("The plugin changed after you reviewed its import warning.");
  }

  const installed = await readStoredPlugins();

  if (installed.some((plugin) => plugin.manifest.id === picked.manifest.id)) {
    throw new Error("a plugin with this id is already installed; remove it first");
  }

  const bundle: PluginBundle = {
    manifest: picked.manifest,
    css: await readTextFile(picked.css, MAX_PLUGIN_CSS_BYTES, "stylesheet"),
    script: picked.script
      ? await readTextFile(picked.script, MAX_PLUGIN_SCRIPT_BYTES, "script")
      : null,
    verified: false,
  };

  validatePluginBundle(bundle);
  await writeStoredPlugins([...installed, bundle]);

  return bundle;
}

export async function pickPluginFile(
  accept: string | null | undefined,
): Promise<string | null> {
  const file = await pickFile(accept);

  if (!file) {
    return null;
  }

  if (file.size > MAX_PLUGIN_FILE_BYTES) {
    throw new Error("The selected file is larger than 8 MB.");
  }

  return readAsDataUrl(file);
}

export async function listInstalledPlugins(): Promise<PluginBundle[]> {
  const plugins = await readStoredPlugins();

  return plugins.sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name, undefined, {
      sensitivity: "base",
    }),
  );
}

export async function removePlugin(id: string): Promise<void> {
  if (!isValidId(id)) {
    throw new Error("that is not a valid plugin id");
  }

  const installed = await readStoredPlugins();

  await writeStoredPlugins(
    installed.filter((plugin) => plugin.manifest.id !== id),
  );
  await removeStoredPluginData(id);
}
