import type { ThemeBundle } from "../../features/themes/types";
import {
  DEFAULT_THEME_CSS,
  MAX_THEME_TAGS,
  normalizeThemeManifest,
  normalizeThemeMode,
  validateThemeBundle,
} from "../../features/themes/package";
import { MAX_CSS_BYTES, MAX_MANIFEST_BYTES } from "./catalog";
import { pickDirectory } from "./dialogs";
import type { BridgeClient } from "./rpc";

/**
 * The page-realm half of local theme import.
 *
 * Folder pickers need the user's activation and stay in the page realm. The
 * theme is read and validated here, then handed to the isolated bridge, which
 * is the only writer of extension storage.
 */

const MANIFEST_FILE = "manifest.json";

let pickedTheme: ThemeBundle | null = null;

async function readTextFile(
  file: File,
  maxBytes: number,
  label: string,
): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`The theme ${label} is larger than the allowed size.`);
  }

  return file.text();
}

/**
 * Reads a theme folder selected with the browser's directory picker.
 *
 * The bundle is kept until `installPickedTheme` stores it. The returned id lets
 * the shared picker hand the same folder back to `install`.
 */
export async function pickLocalTheme(): Promise<string | null> {
  pickedTheme = null;

  const directory = await pickDirectory();

  if (!directory) {
    return null;
  }

  const manifestFile = directory.files.get(MANIFEST_FILE);

  if (!manifestFile) {
    throw new Error("The selected folder has no manifest.json.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      await readTextFile(manifestFile, MAX_MANIFEST_BYTES, "manifest"),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The theme manifest is not valid JSON.");
    }

    throw error;
  }

  const manifest = normalizeThemeManifest(parsed);
  const cssFile = manifest.css ?? DEFAULT_THEME_CSS;
  const stylesheet = directory.files.get(cssFile);

  if (!stylesheet) {
    throw new Error(`The selected folder has no ${cssFile}.`);
  }

  const theme: ThemeBundle = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    version: manifest.version,
    license: manifest.license,
    mode: normalizeThemeMode(manifest.mode),
    tags: manifest.tags.slice(0, MAX_THEME_TAGS),
    css: await readTextFile(stylesheet, MAX_CSS_BYTES, "stylesheet"),
  };

  validateThemeBundle(theme);

  pickedTheme = theme;

  return theme.id;
}

export async function installPickedTheme(
  bridge: BridgeClient,
  source: string,
): Promise<ThemeBundle> {
  const picked = pickedTheme;

  pickedTheme = null;

  if (!picked) {
    throw new Error("Choose a theme folder before importing it.");
  }

  if (picked.id !== source) {
    throw new Error("The theme folder changed before it was imported.");
  }

  return bridge.call<ThemeBundle>("themes:storeBundle", picked);
}
