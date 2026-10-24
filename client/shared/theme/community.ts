import type { ThemeManifest } from "../../generated/types";
import { invokeCommand } from "../tauri";
import { getYapmod } from "../scope";
import type { CommunityTheme, ThemeBundle } from "./types";

const THEME_API = 1;
const DEFAULT_CSS_FILE = "theme.css";
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_CSS_BYTES = 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const VALID_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

type Catalog = {
  api: number;
  themes: CatalogTheme[];
};

type CatalogTheme = {
  id: string;
  name: string;
  version?: string | null;
  author?: string | null;
  description?: string | null;
  license?: string | null;
  mode?: string | null;
  tags?: unknown;
  api: number;
  preview?: string | null;
};

function themesBaseUrl(): string {
  const configured = getYapmod().communityThemesBaseUrl;
  return `${configured ?? "https://ilyeshdz.github.io/yapmod/community-themes"}`
    .replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(id: string): boolean {
  return VALID_ID.test(id) && !id.startsWith(".");
}

function isValidFileName(name: string): boolean {
  return VALID_FILE.test(name) && !name.includes("..");
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeMode(mode: unknown): CommunityTheme["mode"] {
  if (mode === "light" || mode === "both") {
    return mode;
  }

  return "dark";
}

function themeAssetUrl(id: string, filename: string): string {
  return `${themesBaseUrl()}/themes/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
}

async function fetchBytes(url: string, maxBytes: number): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`download failed with status ${response.status}`);
    }

    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error("a community theme file is larger than the allowed size");
    }

    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) {
        throw new Error("a community theme file is larger than the allowed size");
      }
      return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let lengthRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      lengthRead += value.byteLength;
      if (lengthRead > maxBytes) {
        await reader.cancel();
        throw new Error("a community theme file is larger than the allowed size");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(lengthRead);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const bytes = await fetchBytes(url, maxBytes);

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("the community theme file is not valid UTF-8");
  }
}

function parseJson(text: string, description: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`the ${description} is invalid JSON`);
  }
}

function compareNames(left: CommunityTheme, right: CommunityTheme): number {
  const leftName = left.name.toLowerCase();
  const rightName = right.name.toLowerCase();

  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** Downloads and validates the static community catalog in the client. */
export async function listCommunityThemes(): Promise<CommunityTheme[]> {
  const raw = parseJson(
    await fetchText(`${themesBaseUrl()}/index.json`, MAX_CATALOG_BYTES),
    "community theme catalog",
  );

  if (
    !isRecord(raw) ||
    !Number.isInteger(raw.api) ||
    (raw.api as number) < 0 ||
    !Array.isArray(raw.themes)
  ) {
    throw new Error("the community theme catalog is invalid");
  }

  const catalog = raw as unknown as Catalog;
  if (catalog.api > THEME_API) {
    throw new Error(
      `the community catalog needs theme API ${catalog.api}, this version understands ${THEME_API}`,
    );
  }
  if (catalog.themes.length > 500) {
    throw new Error("the community theme catalog contains too many themes");
  }

  const ids = new Set<string>();
  const themes: CommunityTheme[] = [];

  for (const entry of catalog.themes) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !isValidId(entry.id) ||
      ids.has(entry.id)
    ) {
      throw new Error("the community theme catalog contains an invalid or duplicate id");
    }
    ids.add(entry.id);

    if (!Number.isInteger(entry.api) || entry.api < 0) {
      throw new Error(`community theme \`${entry.id}\` has an invalid theme API`);
    }
    if (entry.api > THEME_API) {
      continue;
    }
    if (
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 120
    ) {
      throw new Error(`community theme \`${entry.id}\` has an invalid name`);
    }

    const preview = typeof entry.preview === "string" && isValidFileName(entry.preview)
      ? themeAssetUrl(entry.id, entry.preview)
      : null;
    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
      : [];

    themes.push({
      id: entry.id,
      name: entry.name,
      description: asOptionalString(entry.description),
      author: asOptionalString(entry.author),
      version: asOptionalString(entry.version),
      license: asOptionalString(entry.license),
      mode: normalizeMode(entry.mode),
      tags,
      previewUrl: preview,
    });
  }

  return themes.sort(compareNames);
}

function parseManifest(raw: unknown, expectedId: string): ThemeManifest {
  if (!isRecord(raw) || raw.id !== expectedId || !isValidId(expectedId)) {
    throw new Error("the downloaded theme id does not match the catalog");
  }
  if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 120) {
    throw new Error("the community theme has an invalid name");
  }

  const api = raw.api;
  if (
    api !== undefined &&
    api !== null &&
    (!Number.isInteger(api) || (api as number) < 0)
  ) {
    throw new Error("the community theme API is invalid");
  }
  if (typeof api === "number" && api > THEME_API) {
    throw new Error(
      `the theme was written for theme API ${api}, this version understands ${THEME_API}`,
    );
  }

  const css = asOptionalString(raw.css) ?? DEFAULT_CSS_FILE;
  const preview = asOptionalString(raw.preview);
  if (!isValidFileName(css)) {
    throw new Error("the theme manifest points at an unusable stylesheet");
  }
  if (preview !== null && !isValidFileName(preview)) {
    throw new Error("the theme manifest points at an unusable preview");
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
    : [];

  return {
    id: expectedId,
    name: raw.name,
    version: asOptionalString(raw.version),
    author: asOptionalString(raw.author),
    description: asOptionalString(raw.description),
    license: asOptionalString(raw.license),
    mode: asOptionalString(raw.mode),
    tags,
    api: typeof api === "number" ? api : null,
    preview,
    css,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Downloads and validates a community theme before handing its files to the
 * native store.
 */
export async function installCommunityTheme(id: string): Promise<ThemeBundle> {
  if (!isValidId(id)) {
    throw new Error("that is not a valid theme id");
  }

  const manifestText = await fetchText(
    themeAssetUrl(id, "manifest.json"),
    MAX_MANIFEST_BYTES,
  );
  const manifest = parseManifest(parseJson(manifestText, "community theme manifest"), id);
  const css = await fetchText(
    themeAssetUrl(id, manifest.css ?? DEFAULT_CSS_FILE),
    MAX_CSS_BYTES,
  );

  let previewBase64: string | null = null;
  if (manifest.preview) {
    const extension = manifest.preview.split(".").at(-1) ?? "";
    if (!PREVIEW_EXTENSIONS.has(extension)) {
      throw new Error("the community theme preview has an unsupported file type");
    }
    previewBase64 = toBase64(
      await fetchBytes(themeAssetUrl(id, manifest.preview), MAX_PREVIEW_BYTES),
    );
  }

  return invokeCommand<ThemeBundle>("install_theme_content", {
    manifestJson: manifestText,
    css,
    previewBase64,
  });
}
