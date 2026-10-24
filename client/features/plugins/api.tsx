import { getYapmod } from "../../core/scope";
import { upsertStyle } from "../../shared/ui";
import { invokeCommand } from "../../core/tauri";
import { render } from "solid-js/web";
import { PluginGallery } from "./plugins-gallery";
import {
  mountDialogContent,
  PluginConsent,
  PluginSettingsForm,
  PluginSourceViewer,
} from "./plugin-modals";
import type {
  CommunityPlugin,
  PluginBundle,
  PluginCleanup,
  PluginDiagnostic,
  PluginManifest,
  PluginSetting,
  YapmodPluginInfo,
  YapmodPluginApi,
  YapmodPluginModule,
  YapmodPluginsApi,
} from "../../shared/types";
import pluginCSS from "../../styles/plugins.css";

const ENABLED_KEY = "plugin_enabled";
const CONSENTS_KEY = "plugin_consents";
const PLUGINS_SECTION_ID = "yapmod-plugins";
type ConsentRecord = { version: string; contentHash: string };
type InstalledEntry = {
  bundle: PluginBundle;
  enabled: boolean;
  busy: boolean;
  error: string | null;
  cleanup: PluginCleanup[];
  diagnostic: PluginDiagnostic | null;
};

const registry = new Map<string, InstalledEntry>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error("[yapmod] plugin listener failed", error);
    }
  }
}

function storedRecord<T>(key: string): Record<string, T> {
  const value = getYapmod().store?.get<Record<string, T>>(key, {}) ?? {};
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function consentFor(bundle: PluginBundle): Promise<ConsentRecord> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("A secure plugin fingerprint is unavailable in this webview.");
  // Hash both executable package assets. A version number is author supplied,
  // so it is not sufficient to detect a changed installed package.
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${bundle.css.length}:${bundle.css}\u0000${bundle.script ?? ""}`),
  );
  return {
    version: bundle.manifest.version ?? "",
    contentHash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
}

async function hasCurrentConsent(bundle: PluginBundle): Promise<boolean> {
  const saved = storedRecord<ConsentRecord>(CONSENTS_KEY)[bundle.manifest.id];
  const current = await consentFor(bundle);
  return !!saved && saved.version === current.version &&
    saved.contentHash === current.contentHash;
}

async function saveConsent(bundle: PluginBundle): Promise<void> {
  const values = storedRecord<ConsentRecord>(CONSENTS_KEY);
  values[bundle.manifest.id] = await consentFor(bundle);
  getYapmod().store?.set(CONSENTS_KEY, values);
}

function saveEnabled(id: string, enabled: boolean): void {
  const values = storedRecord<boolean>(ENABLED_KEY);
  values[id] = enabled;
  getYapmod().store?.set(ENABLED_KEY, values);
}

function validateManifest(manifest: PluginManifest): void {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("The plugin manifest must be an object.");
  }
  if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(manifest.id)) {
    throw new Error("The plugin id must contain 1–24 letters, numbers, underscores, or hyphens.");
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim() || manifest.name.length > 100) {
    throw new Error("The plugin name must contain 1–100 characters.");
  }
  for (const field of ["version", "author", "description", "license"] as const) {
    const value = manifest[field];
    const maxLength = field === "description" ? 500 : 100;
    if (value !== undefined && (typeof value !== "string" || value.length > maxLength)) {
      throw new Error(`The plugin ${field} must be at most ${maxLength} characters.`);
    }
  }
  if (manifest.api !== 1) {
    throw new Error(`This plugin uses API ${String(manifest.api)}; this version supports API 1.`);
  }
  if (!Array.isArray(manifest.settings) || manifest.settings.length > 12) {
    throw new Error("The plugin settings list is invalid or too long.");
  }
  const ids = new Set<string>();
  for (const setting of manifest.settings) {
    if (!setting || !/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(setting.id) || ids.has(setting.id) ||
        typeof setting.label !== "string" || !setting.label.trim() || setting.label.length > 80 ||
        (setting.description !== undefined && (typeof setting.description !== "string" || setting.description.length > 200)) ||
        setting.type !== "toggle" || typeof setting.default !== "boolean") {
      throw new Error("The plugin contains an invalid or duplicate setting.");
    }
    ids.add(setting.id);
  }
  if (manifest.stylesheet !== undefined && manifest.stylesheet !== "plugin.css") {
    throw new Error("The plugin stylesheet must be named plugin.css.");
  }
  if (manifest.script !== undefined && manifest.script !== "plugin.js") {
    throw new Error("The plugin script must be named plugin.js.");
  }
}

function validateCss(css: string): void {
  if (typeof css !== "string" || new TextEncoder().encode(css).length > 512 * 1024) {
    throw new Error("The plugin stylesheet is missing or larger than 512 KB.");
  }
  if (hasBlockedCssConstruct(css)) {
    throw new Error("Plugin stylesheets cannot import or load external resources.");
  }
}

/** Mirrors the native CSS check while ignoring harmless quoted text. */
function hasBlockedCssConstruct(css: string): boolean {
  if (css.includes("\\")) return true;
  let normalized = "";
  let quote: string | null = null;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (quote) {
      if (character === quote) quote = null;
      normalized += " ";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      normalized += " ";
      continue;
    }
    if (character === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) return true;
      index = end + 1;
      continue;
    }
    normalized += character.toLowerCase();
  }
  if (quote) return true;

  const isIdentCharacter = (character: string | undefined): boolean =>
    character !== undefined && /[a-z0-9_-]/.test(character);
  let index = 0;
  while (index < normalized.length) {
    if (normalized[index] === "@") {
      const start = index + 1;
      let end = start;
      while (isIdentCharacter(normalized[end])) end += 1;
      if (normalized.slice(start, end) === "import") return true;
      index = Math.max(end, index + 1);
      continue;
    }
    if (/[a-z_-]/.test(normalized[index])) {
      const start = index;
      index += 1;
      while (isIdentCharacter(normalized[index])) index += 1;
      const ident = normalized.slice(start, index);
      if (["url", "expression", "image-set", "-webkit-image-set"].includes(ident)) return true;
      if (ident === "behavior") {
        let next = index;
        while (/\s/.test(normalized[next] ?? "")) next += 1;
        if (normalized[next] === ":") return true;
      }
      continue;
    }
    index += 1;
  }
  return false;
}

function validateBundle(bundle: PluginBundle): void {
  validateManifest(bundle.manifest);
  validateCss(bundle.css);
  if (bundle.script !== null && (typeof bundle.script !== "string" || new TextEncoder().encode(bundle.script).length > 512 * 1024)) {
    throw new Error("The plugin script is invalid or larger than 512 KB.");
  }
}

function requestConsent(
  manifest: PluginManifest,
  action: "import" | "enable",
): Promise<boolean> {
  validateManifest(manifest);
  const api = getYapmod().modal;
  const label = action === "import" ? "Import" : "Enable";

  if (!api) {
    return Promise.resolve(
      window.confirm(
        `${label} ${manifest.name}?\n\nThis CSS plugin can change or imitate the Yapper interface. Only continue if you trust its source.`,
      ),
    );
  }

  let accepted = false;
  const content = mountDialogContent(() => (
    <PluginConsent manifest={manifest} />
  ));
  const modal = api.show({
    title: `${label} ${manifest.name}?`,
    description: "Review the plugin package before it is applied.",
    content: content.element,
    buttons: [
      { label: "Cancel", variant: "secondary" },
      {
        label: `${label} plugin`,
        variant: "danger",
        onClick: () => {
          accepted = true;
        },
      },
    ],
    autoFocus: true,
    onClose: () => content.dispose(),
  });

  return modal.closed.then(() => accepted);
}

function pluginStorageKey(id: string, option: string): string {
  return `plugin:${id}:opt_${option}`;
}

function setOptionAttribute(manifest: PluginManifest, setting: PluginSetting, value: boolean): void {
  const attribute = `data-yapmod-plugin-${manifest.id}-${setting.id}`;
  if (value) document.documentElement.setAttribute(attribute, "true");
  else document.documentElement.removeAttribute(attribute);
}

function applyStoredSettings(entry: InstalledEntry): void {
  for (const setting of entry.bundle.manifest.settings) {
    const value = getYapmod().store?.get<boolean>(
      pluginStorageKey(entry.bundle.manifest.id, setting.id),
      setting.default,
    ) ?? setting.default;
    setOptionAttribute(entry.bundle.manifest, setting, value);
  }
}

function removeSettingAttributes(entry: InstalledEntry): void {
  for (const setting of entry.bundle.manifest.settings) {
    document.documentElement.removeAttribute(
      `data-yapmod-plugin-${entry.bundle.manifest.id}-${setting.id}`,
    );
  }
}

function showPluginSettings(entry: InstalledEntry): void {
  const modalApi = getYapmod().modal;
  if (!modalApi || entry.bundle.manifest.settings.length === 0) return;

  const { manifest } = entry.bundle;
  const draft = new Map<string, boolean>();

  for (const setting of manifest.settings) {
    draft.set(
      setting.id,
      getYapmod().store?.get<boolean>(
        pluginStorageKey(manifest.id, setting.id),
        setting.default,
      ) ?? setting.default,
    );
  }

  const content = mountDialogContent(() => (
    <PluginSettingsForm manifest={manifest} draft={draft} />
  ));

  modalApi.show({
    title: `${manifest.name} settings`,
    description: entry.enabled
      ? "Changes are applied when you save."
      : "Changes are saved now and applied the next time you enable this plugin.",
    content: content.element,
    buttons: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Save",
        variant: "primary",
        onClick: async () => {
          for (const setting of manifest.settings) {
            const value = draft.get(setting.id) ?? setting.default;
            getYapmod().store?.set(
              pluginStorageKey(manifest.id, setting.id),
              value,
            );
            if (entry.enabled) setOptionAttribute(manifest, setting, value);
          }
          await getYapmod().store?.flush();
        },
      },
    ],
    onClose: () => content.dispose(),
  });
}

function showPluginFiles(entry: InstalledEntry): void {
  const modalApi = getYapmod().modal;
  if (!modalApi) return;

  const content = mountDialogContent(() => (
    <PluginSourceViewer bundle={entry.bundle} />
  ));

  modalApi.show({
    title: `${entry.bundle.manifest.name} files`,
    description: "Review the installed package source.",
    content: content.element,
    size: "xl",
    buttons: [{ label: "Close", variant: "secondary" }],
    onClose: () => content.dispose(),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function diagnose(entry: InstalledEntry, operation: PluginDiagnostic["operation"], error: unknown): void {
  const message = errorMessage(error);
  entry.error = `${operation}: ${message}`;
  entry.diagnostic = { operation, message, at: new Date().toISOString() };
  console.error(`[yapmod plugin:${entry.bundle.manifest.id}] ${operation} failed`, error);
}

async function runCleanup(entry: InstalledEntry): Promise<void> {
  for (const cleanup of entry.cleanup.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      diagnose(entry, "cleanup", error);
    }
  }
}

async function enableEntry(entry: InstalledEntry): Promise<void> {
  if (entry.enabled) return;
  validateBundle(entry.bundle);
  const styleId = `yapmod-plugin-style-${entry.bundle.manifest.id}`;
  entry.cleanup = [];
  try {
    upsertStyle(styleId, entry.bundle.css);
    applyStoredSettings(entry);
    entry.cleanup = [
      () => document.getElementById(styleId)?.remove(),
      () => removeSettingAttributes(entry),
    ];
    if (entry.bundle.script !== null) {
      const manifest = entry.bundle.manifest;
      const scriptStyleIds: string[] = [];
      const api: YapmodPluginApi = Object.freeze({
        id: manifest.id,
        manifest: Object.freeze({ ...manifest }),
        storage: Object.freeze({
          get<T>(key: string, fallback?: T): T {
            if (!/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(key)) throw new Error("Invalid plugin storage key.");
            return getYapmod().store?.get<T>(`plugin:${manifest.id}:data_${key}`, fallback) as T;
          },
          set(key: string, value: unknown): void {
            if (!/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(key)) throw new Error("Invalid plugin storage key.");
            getYapmod().store?.set(`plugin:${manifest.id}:data_${key}`, value);
          },
        }),
        settings: Object.freeze({
          get(id: string): boolean {
            const setting = manifest.settings.find((item) => item.id === id);
            if (!setting) throw new Error(`Unknown plugin setting: ${id}`);
            return getYapmod().store?.get<boolean>(pluginStorageKey(manifest.id, id), setting.default) ?? setting.default;
          },
          onChange(id: string, listener: (value: boolean) => void): () => void {
            const setting = manifest.settings.find((item) => item.id === id);
            if (!setting) throw new Error(`Unknown plugin setting: ${id}`);
            return getYapmod().store?.onChange(pluginStorageKey(manifest.id, id), (value: unknown) => listener(Boolean(value))) ?? (() => {});
          },
        }),
        styles: Object.freeze({
          add(css: string): PluginCleanup {
            validateCss(css);
            const id = `yapmod-plugin-script-style-${manifest.id}-${scriptStyleIds.length}`;
            scriptStyleIds.push(id);
            upsertStyle(id, css);
            return () => document.getElementById(id)?.remove();
          },
        }),
      banner(message: string): void {
        getYapmod().banner?.show({ id: `plugin-${manifest.id}`, message, dismissible: true });
      },
      });
      // Plugins are trusted page code by design. This does not sandbox or
      // restrict the JavaScript realm available to a plugin author.
      entry.cleanup.push(() => scriptStyleIds.forEach((id) => document.getElementById(id)?.remove()));
      const module = new Function("api", "document", "window", entry.bundle.script)(api, document, window) as unknown;
      if (!module || typeof module !== "object" || typeof (module as YapmodPluginModule).activate !== "function") {
        throw new Error("plugin.js must return an object with an activate(api) function.");
      }
      const cleanup = await (module as YapmodPluginModule).activate(api);
      if (typeof cleanup === "function") entry.cleanup.push(cleanup);
    }
  } catch (error) {
    await runCleanup(entry);
    throw error;
  }
  entry.enabled = true;
  saveEnabled(entry.bundle.manifest.id, true);
}

async function disableEntry(entry: InstalledEntry): Promise<void> {
  if (!entry.enabled) return;
  await runCleanup(entry);
  entry.enabled = false;
  saveEnabled(entry.bundle.manifest.id, false);
}

async function registerBundle(bundle: PluginBundle): Promise<void> {
  validateBundle(bundle);
  const current = registry.get(bundle.manifest.id);
  if (current) {
    if (JSON.stringify(current.bundle.manifest) === JSON.stringify(bundle.manifest)) {
      current.bundle = bundle;
      return;
    }
    await disableEntry(current);
    registry.delete(bundle.manifest.id);
  }
  const entry: InstalledEntry = { bundle, enabled: false, busy: false, error: null, cleanup: [], diagnostic: null };
  registry.set(bundle.manifest.id, entry);
  if (storedRecord<boolean>(ENABLED_KEY)[bundle.manifest.id] && await hasCurrentConsent(bundle)) {
    try {
      await enableEntry(entry);
    } catch (error) {
      diagnose(entry, "load", error);
    }
  }
}

function listPlugins(): YapmodPluginInfo[] {
  return [...registry.values()].map((entry) => ({
    manifest: entry.bundle.manifest,
    source: "installed",
    enabled: entry.enabled,
    busy: entry.busy,
    error: entry.error,
    diagnostic: entry.diagnostic,
  }));
}

async function setEnabled(id: string, enabled: boolean): Promise<boolean> {
  const entry = registry.get(id);
  if (!entry || entry.busy) return false;
  entry.busy = true;
  entry.error = null;
  entry.diagnostic = null;
  emitChange();
  try {
    if (enabled) {
      if (!await hasCurrentConsent(entry.bundle)) {
        if (!(await requestConsent(entry.bundle.manifest, "enable"))) return false;
        await saveConsent(entry.bundle);
      }
      await enableEntry(entry);
    } else {
      await disableEntry(entry);
    }
    return true;
  } catch (error) {
    diagnose(entry, enabled ? "activate" : "deactivate", error);
    return false;
  } finally {
    entry.busy = false;
    emitChange();
  }
}

/** Installs the package import, consent, and lifecycle API. */
export function installPluginApi(): void {
  const api: YapmodPluginsApi = {
    list: listPlugins,
    setEnabled,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async importLocal() {
      const manifest = await invokeCommand<PluginManifest | null>("pick_plugin_folder");
      if (!manifest || !(await requestConsent(manifest, "import"))) return null;
      const bundle = await invokeCommand<PluginBundle>("install_picked_plugin", { expectedManifest: manifest });
      validateBundle(bundle);
      if (JSON.stringify(bundle.manifest) !== JSON.stringify(manifest)) {
        throw new Error("The plugin changed after you reviewed its import warning.");
      }
      await registerBundle(bundle);
      await saveConsent(bundle);
      emitChange();
      return bundle.manifest;
    },
    listCommunity() { return invokeCommand<CommunityPlugin[]>("list_community_plugins"); },
    async installCommunity(id) {
      const manifest = await invokeCommand<PluginManifest>("preview_community_plugin", { id });
      if (!(await requestConsent(manifest, "import"))) throw new Error("Plugin installation was cancelled.");
      const bundle = await invokeCommand<PluginBundle>("install_community_plugin", { id, expectedManifest: manifest });
      validateBundle(bundle);
      if (JSON.stringify(bundle.manifest) !== JSON.stringify(manifest)) {
        throw new Error("The community plugin changed after you reviewed its import warning.");
      }
      await registerBundle(bundle);
      await saveConsent(bundle);
      emitChange();
      return bundle.manifest;
    },
    async remove(id) {
      const entry = registry.get(id);
      if (!entry) return;
      await disableEntry(entry);
      await invokeCommand<void>("remove_plugin", { id });
      registry.delete(id);
      emitChange();
    },
    async refreshInstalled() {
      const bundles = await invokeCommand<PluginBundle[]>("list_plugins");
      const next = new Map(bundles.map((bundle) => [bundle.manifest.id, bundle]));
      for (const [id, entry] of registry) {
        const bundle = next.get(id);
        if (!bundle || JSON.stringify(entry.bundle.manifest) !== JSON.stringify(bundle.manifest)) {
          await disableEntry(entry);
          registry.delete(id);
        }
      }
      for (const bundle of bundles) await registerBundle(bundle);
      emitChange();
    },
    openFolder() { return invokeCommand<void>("open_plugins_folder"); },
  };
  getYapmod().plugins = api;
}

/** Restores installed packages that were previously enabled and consented to. */
export function initializePluginManager(): void {
  void getYapmod().plugins?.refreshInstalled().catch((error: unknown) => {
    console.error("[yapmod] could not load installed plugins", error);
  });
}

/** Opens the settings dialog of an installed plugin, by id. */
function openPluginSettings(id: string): void {
  const entry = registry.get(id);

  if (entry) {
    showPluginSettings(entry);
  }
}

/** Opens the files of an installed plugin, by id. */
function openPluginFiles(id: string): void {
  const entry = registry.get(id);

  if (entry) {
    showPluginFiles(entry);
  }
}

/** Registers the Installed / Community plugin gallery in settings. */
export function installPluginSettings(): void {
  const yapmod = getYapmod();
  const plugins = yapmod.plugins;

  if (!plugins || !yapmod.settings) return;

  upsertStyle("yapmod-plugin-ui-styles", pluginCSS);

  yapmod.settings.register({
    id: PLUGINS_SECTION_ID,
    label: "Plugins",
    icon: "puzzle",
    group: "Yapmod",
    order: 3,
    description:
      "Import local plugins or browse community packages. JavaScript plugins run as trusted code in the Yapper page.",
    render: (host: HTMLElement) =>
      render(
        () => (
          <PluginGallery
            plugins={plugins}
            onOpenSettings={openPluginSettings}
            onOpenFiles={openPluginFiles}
          />
        ),
        host,
      ),
  });
}
