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
import { fetchCatalogJson, fetchCatalogText } from "./fetch";
import {
  normalizePluginManifest,
  samePluginManifest,
  validatePluginBundle,
} from "../../features/plugins/package";
import {
  readStoredPlugins,
  removeStoredPluginData,
  writeStoredPlugins,
} from "./storage";

/**
 * Community plugin installation for the browser extension.
 *
 * Plugins are plain data in extension storage. This module runs in the
 * isolated bridge; the page realm owns the package pickers and the plugin
 * engine.
 */

const MANIFEST_FILE = "manifest.json";
const CSS_FILE = "plugin.css";

type CatalogEntry = PluginManifest & { verified?: boolean };
type Catalog = { api: number; plugins: CatalogEntry[] };

function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,23}$/i.test(id);
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

  const expected = normalizePluginManifest(entry);
  const manifest = normalizePluginManifest(
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
      const manifest = normalizePluginManifest(entry);

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
 * Stores a locally imported package after the page realm has read and
 * validated its files. The bridge is the only writer of extension storage.
 */
export async function storeImportedPlugin(
  bundle: PluginBundle,
): Promise<PluginBundle> {
  validatePluginBundle(bundle);

  const installed = await readStoredPlugins();

  if (installed.some((plugin) => plugin.manifest.id === bundle.manifest.id)) {
    throw new Error("a plugin with this id is already installed; remove it first");
  }

  await writeStoredPlugins([...installed, bundle]);

  return bundle;
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
