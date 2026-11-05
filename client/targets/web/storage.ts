import type { PluginBundle } from "../../shared/types";
import type { ThemeBundle } from "../../features/themes/types";
import { extensionApi, storageArea } from "./extension";

const SETTINGS_KEY = "yapmod:settings";
const THEMES_KEY = "yapmod:themes";
const PLUGINS_KEY = "yapmod:plugins";

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

function isPluginBundle(value: unknown): value is PluginBundle {
  if (!isRecord(value) || !isRecord(value.manifest)) {
    return false;
  }

  const manifest = value.manifest;

  return (
    typeof manifest.id === "string" &&
    typeof manifest.name === "string" &&
    typeof value.css === "string" &&
    (value.script === null || typeof value.script === "string") &&
    typeof value.verified === "boolean"
  );
}

export async function readStoredPlugins(): Promise<PluginBundle[]> {
  const value = await readJson(PLUGINS_KEY);

  return Array.isArray(value) ? value.filter(isPluginBundle) : [];
}

export async function writeStoredPlugins(
  plugins: PluginBundle[],
): Promise<void> {
  await writeJson(PLUGINS_KEY, plugins);
}

/**
 * Drops the settings a plugin owns when its package is removed.
 *
 * Plugin state lives in the shared settings object, next to the settings of
 * the client, so removing a package must clean up its namespaced keys too.
 */
export async function removeStoredPluginData(id: string): Promise<void> {
  const settings = await readStoredSettings();
  const prefix = `plugin:${id}:`;
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(prefix)) {
      continue;
    }

    if (key === "plugin_enabled" || key === "plugin_consents") {
      if (isRecord(value)) {
        const entries = { ...value };
        delete entries[id];
        next[key] = entries;
        continue;
      }
    }

    next[key] = value;
  }

  await writeJson(SETTINGS_KEY, next);
}
