import type { ThemeBundle } from "../../features/themes/types";
import { extensionApi, storageArea } from "./extension";

const SETTINGS_KEY = "yapmod:settings";
const THEMES_KEY = "yapmod:themes";

function hasStorage(): boolean {
  return extensionApi()?.storage?.local !== undefined;
}

function readFallback(key: string): unknown {
  try {
    const value = window.localStorage.getItem(key);

    return value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

function writeFallback(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; settings still work for this session.
  }
}

async function readJson(key: string): Promise<unknown> {
  if (hasStorage()) {
    const values = await storageArea().get(key);

    return values[key] ?? null;
  }

  return readFallback(key);
}

async function writeJson(key: string, value: unknown): Promise<void> {
  if (hasStorage()) {
    await storageArea().set({ [key]: value });
    return;
  }

  writeFallback(key, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readStoredSettings(): Promise<Record<string, unknown>> {
  const value = await readJson(SETTINGS_KEY);

  return isRecord(value) ? value : {};
}

/** Merges a batch into the stored settings so concurrent writes stay whole. */
export async function saveStoredSettings(
  values: Record<string, unknown>,
): Promise<void> {
  const current = await readStoredSettings();

  await writeJson(SETTINGS_KEY, { ...current, ...values });
}

export async function readStoredThemes(): Promise<ThemeBundle[]> {
  const value = await readJson(THEMES_KEY);

  return Array.isArray(value)
    ? value.filter(
        (theme): theme is ThemeBundle =>
          isRecord(theme) &&
          typeof theme.id === "string" &&
          typeof theme.name === "string" &&
          typeof theme.css === "string",
      )
    : [];
}

export async function writeStoredThemes(themes: ThemeBundle[]): Promise<void> {
  await writeJson(THEMES_KEY, themes);
}
