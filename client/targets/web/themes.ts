import type {
  CommunityTheme,
  ThemeBundle,
  ThemeManifest,
  ThemeMode,
} from "../../features/themes/types";
import {
  THEME_CATALOG_BASE,
  DEFAULT_CSS_FILE,
  MAX_CATALOG_BYTES,
  MAX_CSS_BYTES,
  MAX_MANIFEST_BYTES,
  THEME_API,
} from "./catalog";
import { fetchCatalogJson, fetchCatalogText } from "./fetch";
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
  preview?: string | null;
};

type Catalog = {
  api: number;
  themes: CatalogEntry[];
};

function isValidId(id: string): boolean {
  return (
    id.length > 0 &&
    !id.startsWith(".") &&
    [...id].every((character) =>
      /[a-zA-Z0-9._-]/.test(character),
    )
  );
}

function isValidFileName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("..") &&
    [...name].every((character) => /[a-zA-Z0-9._-]/.test(character))
  );
}

function normalizeMode(mode: string | null | undefined): ThemeMode {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  return "both";
}

function previewUrl(entry: CatalogEntry): string | null {
  const preview = entry.preview;

  if (!preview || !isValidFileName(preview)) {
    return null;
  }

  return `${THEME_CATALOG_BASE}/themes/${entry.id}/${preview}`;
}

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
        isValidId(entry.id) &&
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
      mode: normalizeMode(entry.mode),
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 20) : [],
      previewUrl: previewUrl(entry),
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

/** Downloads one theme from the catalog and stores it in extension storage. */
export async function installCommunityTheme(id: string): Promise<ThemeBundle> {
  if (!isValidId(id)) {
    throw new Error("that is not a valid theme id");
  }

  const manifest = await fetchCatalogJson<ThemeManifest>(
    `${THEME_CATALOG_BASE}/themes/${id}/manifest.json`,
    MAX_MANIFEST_BYTES,
  );

  if (manifest.id !== id) {
    throw new Error("the downloaded theme id does not match the catalog");
  }

  if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
    throw new Error("the community theme has an invalid name");
  }

  const api = manifest.api;

  if (typeof api === "number" && api > THEME_API) {
    throw new Error("the theme was written for a newer theme API");
  }

  const cssFile = manifest.css ?? DEFAULT_CSS_FILE;

  if (!isValidFileName(cssFile)) {
    throw new Error("the theme manifest points at an unusable stylesheet");
  }

  const css = await fetchCatalogText(
    `${THEME_CATALOG_BASE}/themes/${id}/${cssFile}`,
    MAX_CSS_BYTES,
  );

  const theme: ThemeBundle = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? null,
    author: manifest.author ?? null,
    version: manifest.version ?? null,
    license: manifest.license ?? null,
    mode: normalizeMode(manifest.mode),
    tags: Array.isArray(manifest.tags) ? manifest.tags.slice(0, 20) : [],
    css,
    preview: null,
  };

  const installed = await readStoredThemes();
  const next = installed.filter((candidate) => candidate.id !== id);
  next.push(theme);
  await writeStoredThemes(next);

  return theme;
}

export async function removeTheme(id: string): Promise<void> {
  const installed = await readStoredThemes();

  await writeStoredThemes(installed.filter((theme) => theme.id !== id));
}
