import type {
  CommunityTheme,
  ThemeBundle,
  ThemeManifest,
} from "../../features/themes/types";
import {
  THEME_CATALOG_BASE,
  MAX_CATALOG_BYTES,
  MAX_CSS_BYTES,
  MAX_MANIFEST_BYTES,
} from "./catalog";
import { fetchCatalogJson, fetchCatalogText } from "./fetch";
import {
  DEFAULT_THEME_CSS,
  MAX_THEME_TAGS,
  THEME_API,
  isValidThemeFileName,
  isValidThemeId,
  normalizeThemeManifest,
  normalizeThemeMode,
  validateThemeBundle,
} from "../../features/themes/package";
import { readStoredThemes, writeStoredThemes } from "./storage";

/**
 * The static catalog the desktop client uses as well. Themes are CSS only, so
 * the extension can install them without running package code.
 */

type CatalogEntry = {
  id: string;
  name: string;
  version?: string | null;
  author?: string | null;
  description?: string | null;
  license?: string | null;
  mode?: string | null;
  tags?: string[];
  api?: number;
};

type Catalog = {
  api: number;
  themes: CatalogEntry[];
};

/** The community catalog, filtered to themes this client understands. */
export async function listCommunityThemes(): Promise<CommunityTheme[]> {
  const catalog = await fetchCatalogJson<Catalog>(
    `${THEME_CATALOG_BASE}/index.json`,
    MAX_CATALOG_BYTES,
  );

  if (typeof catalog.api !== "number" || catalog.api > THEME_API) {
    throw new Error("the community catalog needs a newer theme API");
  }

  if (!Array.isArray(catalog.themes)) {
    throw new Error("the community theme catalog is invalid");
  }

  return catalog.themes
    .filter(
      (entry) =>
        typeof entry.id === "string" &&
        isValidThemeId(entry.id) &&
        typeof entry.name === "string" &&
        entry.name.trim().length > 0 &&
        (entry.api === undefined || entry.api <= THEME_API),
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description ?? null,
      author: entry.author ?? null,
      version: entry.version ?? null,
      license: entry.license ?? null,
      mode: normalizeThemeMode(entry.mode),
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 20) : [],
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

/** Downloads one theme from the catalog and stores it in extension storage. */
export async function installCommunityTheme(id: string): Promise<ThemeBundle> {
  if (!isValidThemeId(id)) {
    throw new Error("that is not a valid theme id");
  }

  const manifest = normalizeThemeManifest(
    await fetchCatalogJson<ThemeManifest>(
      `${THEME_CATALOG_BASE}/themes/${id}/manifest.json`,
      MAX_MANIFEST_BYTES,
    ),
  );

  if (manifest.id !== id) {
    throw new Error("the downloaded theme id does not match the catalog");
  }

  const cssFile = manifest.css ?? DEFAULT_THEME_CSS;

  if (!isValidThemeFileName(cssFile)) {
    throw new Error("the theme manifest points at an unusable stylesheet");
  }

  const css = await fetchCatalogText(
    `${THEME_CATALOG_BASE}/themes/${id}/${cssFile}`,
    MAX_CSS_BYTES,
  );

  const theme: ThemeBundle = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    version: manifest.version,
    license: manifest.license,
    mode: normalizeThemeMode(manifest.mode),
    tags: manifest.tags.slice(0, 20),
    css,
  };

  const installed = await readStoredThemes();
  const next = installed.filter((candidate) => candidate.id !== id);
  next.push(theme);
  await writeStoredThemes(next);

  return theme;
}

/**
 * Stores a locally imported theme after the page realm has read and validated
 * its folder. The bridge is the only writer of extension storage.
 */
export async function storeImportedTheme(
  bundle: ThemeBundle,
): Promise<ThemeBundle> {
  if (typeof bundle !== "object" || bundle === null) {
    throw new Error("the theme bundle is invalid");
  }

  // Rebuild the bundle so extension storage only holds known fields and the
  // values the theme engine expects.
  const theme: ThemeBundle = {
    id: bundle.id,
    name: bundle.name,
    description:
      typeof bundle.description === "string" ? bundle.description : null,
    author: typeof bundle.author === "string" ? bundle.author : null,
    version: typeof bundle.version === "string" ? bundle.version : null,
    license: typeof bundle.license === "string" ? bundle.license : null,
    mode: normalizeThemeMode(bundle.mode),
    tags: Array.isArray(bundle.tags)
      ? bundle.tags
          .filter((tag): tag is string => typeof tag === "string")
          .slice(0, MAX_THEME_TAGS)
      : [],
    css: bundle.css,
  };

  validateThemeBundle(theme);

  const installed = await readStoredThemes();

  if (installed.some((candidate) => candidate.id === theme.id)) {
    throw new Error("a theme with this id is already installed; remove it first");
  }

  await writeStoredThemes([...installed, theme]);

  return theme;
}

/** Re-reads an installed theme from extension storage. */
export async function reloadTheme(id: string): Promise<ThemeBundle> {
  if (!isValidThemeId(id)) {
    throw new Error("that is not a valid theme id");
  }

  const installed = await readStoredThemes();
  const theme = installed.find((candidate) => candidate.id === id);

  if (!theme) {
    throw new Error("that theme is not installed");
  }

  return theme;
}

export async function removeTheme(id: string): Promise<void> {
  const installed = await readStoredThemes();

  await writeStoredThemes(installed.filter((theme) => theme.id !== id));
}
