import { getYapmod } from "./scope";
import { createElement, upsertStyle } from "./ui";
import { invokeCommand } from "./tauri";
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
} from "./types";
import { PLUGIN_UI_CSS } from "./plugins.styles";

const ENABLED_KEY = "plugin_enabled";
const CONSENTS_KEY = "plugin_consents";
const PLUGINS_SECTION_ID = "yapmod-plugins";
const PLUGIN_ICON_PATHS = {
  settings: [
    "M4 6h16M4 12h16M4 18h16",
    "M9 4v4M15 10v4M11 16v4",
  ],
  files: [
    "M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5Z",
    "M14 2.5v6h6",
    "M8 13h8M8 17h6",
  ],
} as const;

type ConsentRecord = { version: string; contentHash: string };
type InstalledEntry = {
  bundle: PluginBundle;
  enabled: boolean;
  busy: boolean;
  error: string | null;
  cleanup: PluginCleanup[];
  diagnostic: PluginDiagnostic | null;
};

function createPluginIcon(name: keyof typeof PLUGIN_ICON_PATHS): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "yapmod-plugin-action-icon");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const pathData of PLUGIN_ICON_PATHS[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

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

function consentText(manifest: PluginManifest): HTMLElement {
  return createElement("div", {
    children: [
      createElement("p", {
        text: `${manifest.name}${manifest.author ? ` by ${manifest.author}` : ""}${manifest.version ? ` · version ${manifest.version}` : ""} is asking to be installed.`,
      }),
      createElement("p", {
        text: manifest.script ? "This plugin runs JavaScript directly in the Yapper window. It can read and change the page, interact with functionality available to that page, and access sensitive data visible there. It is not sandboxed or isolated. Installing it means trusting its author and accepting these risks." : "This plugin can change or imitate the Yapper interface through CSS. Plugins are not reviewed or guaranteed safe; only install packages you trust.",
      }),
      ...(manifest.description ? [createElement("p", { text: manifest.description })] : []),
      createElement("p", { text: manifest.script ? "This package contains plugin.js. It is loaded only after this confirmation." : "This package does not contain JavaScript." }),
    ],
  });
}

function requestConsent(manifest: PluginManifest, action: "import" | "enable"): Promise<boolean> {
  validateManifest(manifest);
  const api = getYapmod().modal;
  const label = action === "import" ? "Import" : "Enable";
  if (!api) {
    return Promise.resolve(window.confirm(`${label} ${manifest.name}?\n\nThis CSS plugin can change or imitate the Yapper interface. Only continue if you trust its source.`));
  }
  let accepted = false;
  const modal = api.show({
    title: `${label} ${manifest.name}?`,
    description: "Review the plugin package before it is applied.",
    content: consentText(manifest),
    buttons: [
      { label: "Cancel", variant: "secondary" },
      { label: `${label} plugin`, variant: "danger", onClick: () => { accepted = true; } },
    ],
    autoFocus: true,
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
  const controls = manifest.settings.map((setting) => {
    const current = getYapmod().store?.get<boolean>(
      pluginStorageKey(manifest.id, setting.id),
      setting.default,
    ) ?? setting.default;
    draft.set(setting.id, current);
    const input = createElement("input", {
      className: "switch",
      attrs: { "aria-label": setting.label },
      props: { type: "checkbox", checked: current },
      on: { change: (event) => draft.set(setting.id, (event.currentTarget as HTMLInputElement).checked) },
    });
    return createElement("label", {
      className: "toggle-row yapmod-plugin-setting-row",
      children: [
        createElement("span", {
          children: [
            createElement("div", { className: "toggle-label", text: setting.label }),
            ...(setting.description ? [createElement("div", { className: "hint", text: setting.description })] : []),
          ],
        }),
        input,
      ],
    });
  });
  const content = createElement("div", { className: "yapmod-plugin-settings-modal", children: controls });
  modalApi.show({
    title: `${manifest.name} settings`,
    description: entry.enabled
      ? "Changes are applied when you save."
      : "Changes are saved now and applied the next time you enable this plugin.",
    content,
    buttons: [
      { label: "Cancel", variant: "secondary" },
      {
        label: "Save",
        variant: "primary",
        onClick: async () => {
          for (const setting of manifest.settings) {
            const value = draft.get(setting.id) ?? setting.default;
            getYapmod().store?.set(pluginStorageKey(manifest.id, setting.id), value);
            if (entry.enabled) setOptionAttribute(manifest, setting, value);
          }
          await getYapmod().store?.flush();
        },
      },
    ],
  });
}

function appendSourceFile(container: HTMLElement, filename: string, source: string): void {
  const code = createElement("pre", {
    className: "yapmod-plugin-source-code",
    children: [createElement("code", { text: source })],
  });
  container.append(createElement("details", {
    className: "yapmod-plugin-source-file",
    children: [createElement("summary", { text: filename }), code],
  }));
}

function showPluginFiles(entry: InstalledEntry): void {
  const modalApi = getYapmod().modal;
  if (!modalApi) return;
  const { bundle } = entry;
  const content = createElement("div", { className: "yapmod-plugin-source-viewer" });
  content.append(createElement("p", {
    className: "yapmod-plugin-source-note",
    text: "These are the package contents loaded by Yapmod. Community plugins are copied to this local installation and can be reviewed here.",
  }));
  appendSourceFile(content, "manifest.json", JSON.stringify(bundle.manifest, null, 2));
  appendSourceFile(content, "plugin.css", bundle.css);
  if (bundle.script !== null) appendSourceFile(content, "plugin.js", bundle.script);
  modalApi.show({
    title: `${bundle.manifest.name} files`,
    description: "Review the installed package source.",
    content,
    size: "xl",
    buttons: [{ label: "Close", variant: "secondary" }],
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
            return getYapmod().store?.onChange(pluginStorageKey(manifest.id, id), (value) => listener(Boolean(value))) ?? (() => {});
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

function createCard(
  plugin: YapmodPluginInfo,
  onToggle: () => void,
  onRemove: () => void,
  onSettings: () => void,
  onInspect: () => void,
): HTMLElement {
  const { manifest } = plugin;
  return createElement("article", {
    className: ["yapmod-plugin-card", plugin.enabled ? "yapmod-plugin-active" : ""].filter(Boolean).join(" "),
    children: [
      createElement("div", {
        className: "yapmod-plugin-card-body",
        children: [
          createElement("div", {
            className: "yapmod-plugin-card-title-row",
            children: [
              createElement("h3", { className: "yapmod-plugin-card-name", text: manifest.name }),
              createElement("span", { className: plugin.enabled ? "yapmod-plugin-state yapmod-plugin-state-active" : "yapmod-plugin-state", text: plugin.enabled ? "Enabled" : "Disabled" }),
            ],
          }),
          createElement("p", { className: "yapmod-plugin-card-meta", text: [manifest.author, manifest.version ? `v${manifest.version}` : null].filter(Boolean).join(" · ") }),
          createElement("p", { className: "yapmod-plugin-card-description", text: manifest.description ?? "No description provided." }),
          ...(manifest.script ? [createElement("p", { className: "yapmod-plugin-warning", text: "Trusted JavaScript plugin — runs in the Yapper page." })] : []),
          ...(plugin.error ? [createElement("p", { className: "yapmod-plugin-error", text: plugin.error })] : []),
        ],
      }),
      createElement("div", {
        className: "yapmod-plugin-card-foot",
        children: [
          createElement("div", {
            className: "yapmod-plugin-card-actions",
            children: [
              ...(manifest.settings.length ? [createElement("button", { className: "btn small ghost yapmod-plugin-icon-button", attrs: { type: "button", "aria-label": `Settings for ${manifest.name}`, title: "Plugin settings" }, children: [createPluginIcon("settings")], on: { click: onSettings } })] : []),
              createElement("button", { className: "btn small ghost yapmod-plugin-icon-button", attrs: { type: "button", "aria-label": `View files for ${manifest.name}`, title: "View plugin files" }, children: [createPluginIcon("files")], on: { click: onInspect } }),
              createElement("button", { className: "btn small ghost", text: "Remove", props: { type: "button" }, on: { click: onRemove } }),
            ],
          }),
          createElement("button", { className: "btn small ghost", text: plugin.busy ? "Working…" : plugin.enabled ? "Disable" : "Enable", props: { type: "button", disabled: plugin.busy }, on: { click: onToggle } }),
        ],
      }),
    ],
  });
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
  void getYapmod().plugins?.refreshInstalled().catch((error) => {
    console.error("[yapmod] could not load installed plugins", error);
  });
}

/** Registers the Installed / Community plugin gallery in settings. */
export function installPluginSettings(): void {
  const yapmod = getYapmod();
  const plugins = yapmod.plugins;
  if (!plugins || !yapmod.settings) return;
  const pluginApi = plugins;

  upsertStyle("yapmod-plugin-ui-styles", PLUGIN_UI_CSS);
  yapmod.settings.register({
    id: PLUGINS_SECTION_ID,
    label: "Plugins",
    icon: "puzzle",
    group: "Yapmod",
    order: 3,
    description: "Import local plugins or browse community packages. JavaScript plugins run as trusted code in the Yapper page.",
    render: (host) => {
      let disposed = false;
      let community: CommunityPlugin[] = [];
      let communityLoaded = false;
      let loadingCommunity = false;
      let searchQuery = "";
      let view: "installed" | "community" = "installed";

      const installedGrid = createElement("div", { className: "yapmod-plugin-grid" });
      const communityGrid = createElement("div", { className: "yapmod-plugin-grid", props: { hidden: true } });
      const status = createElement("p", { className: "hint yapmod-plugin-status", attrs: { "aria-live": "polite" } });
      const setStatus = (message: string, isError = false): void => {
        status.textContent = message;
        status.classList.toggle("yapmod-plugin-status-error", isError);
      };
      const installedTab = createElement("button", { className: "btn small ghost yapmod-theme-tab-active", text: "Installed", attrs: { type: "button", role: "tab", "aria-selected": "true" }, on: { click: () => setView("installed") } });
      const communityTab = createElement("button", { className: "btn small ghost", text: "Community", attrs: { type: "button", role: "tab", "aria-selected": "false" }, on: { click: () => setView("community") } });
      const tabs = createElement("div", { className: "yapmod-theme-tabs", attrs: { role: "tablist", "aria-label": "Plugin collection" }, children: [installedTab, communityTab] });

      const refreshInstalled = async (): Promise<void> => {
        try { await pluginApi.refreshInstalled(); }
        catch (error) { setStatus(`Could not refresh installed plugins: ${String(error)}`, true); }
      };
      const loadCommunity = async (force = false): Promise<void> => {
        if (loadingCommunity || (communityLoaded && !force)) return;
        loadingCommunity = true;
        setStatus("Loading community plugins…");
        try {
          community = await pluginApi.listCommunity();
          communityLoaded = true;
          setStatus(`${community.length} community plugin${community.length === 1 ? "" : "s"} available.`);
          renderCommunity();
        } catch (error) { setStatus(`Could not load community plugins: ${String(error)}`, true); }
        finally { loadingCommunity = false; }
      };
      const importLocal = async (): Promise<void> => {
        try {
          setStatus("Choose a plugin folder…");
          const manifest = await pluginApi.importLocal();
          if (!manifest) { setStatus("Plugin import cancelled."); return; }
          setStatus(`Imported ${manifest.name}.`);
          await refreshInstalled();
        } catch (error) { setStatus(`Could not import plugin: ${String(error)}`, true); }
      };
      const installCommunity = async (item: CommunityPlugin): Promise<void> => {
        try {
          setStatus(`Installing ${item.name}…`);
          await pluginApi.installCommunity(item.id);
          setStatus(`Installed ${item.name}.`);
          await refreshInstalled();
          renderCommunity();
        } catch (error) { setStatus(`Could not install ${item.name}: ${String(error)}`, true); }
      };
      const removePlugin = async (plugin: YapmodPluginInfo): Promise<void> => {
        if (!window.confirm(`Remove ${plugin.manifest.name}? Its package files will be deleted from the plugins folder.`)) return;
        try { await pluginApi.remove(plugin.manifest.id); setStatus(`Removed ${plugin.manifest.name}.`); renderInstalled(); renderCommunity(); }
        catch (error) { setStatus(`Could not remove plugin: ${String(error)}`, true); }
      };

      function renderInstalled(): void {
        const current = pluginApi.list();
        if (!current.length) {
          installedGrid.replaceChildren(createElement("p", { className: "hint", text: "No plugins installed yet. Import a folder or browse Community." }));
          return;
        }
        installedGrid.replaceChildren(...current.map((plugin) => createCard(plugin, () => {
          void pluginApi.setEnabled(plugin.manifest.id, !plugin.enabled).then((success) => {
            if (!success && !plugin.enabled) setStatus("The plugin was not enabled. Review the warning or check the error on its card.", true);
            renderInstalled();
          });
        }, () => void removePlugin(plugin), () => {
          const entry = registry.get(plugin.manifest.id);
          if (entry) showPluginSettings(entry);
        }, () => {
          const entry = registry.get(plugin.manifest.id);
          if (entry) showPluginFiles(entry);
        })));
      }
      function renderCommunity(): void {
        const installed = new Set(pluginApi.list().map((plugin) => plugin.manifest.id));
        const query = searchQuery.trim().toLowerCase();
        const entries = community.filter((item) => !query || `${item.name} ${item.author ?? ""} ${item.description ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase().includes(query));
        if (!entries.length) {
          communityGrid.replaceChildren(createElement("p", { className: "hint", text: community.length ? "No community plugins match this search." : "No community plugins are published yet." }));
          return;
        }
        communityGrid.replaceChildren(...entries.map((plugin) => createElement("article", {
          className: "yapmod-plugin-card",
          children: [
            createElement("div", { className: "yapmod-plugin-card-body", children: [
              createElement("div", { className: "yapmod-plugin-card-title-row", children: [createElement("h3", { className: "yapmod-plugin-card-name", text: plugin.name })] }),
              createElement("p", { className: "yapmod-plugin-card-meta", text: [plugin.author, plugin.version ? `v${plugin.version}` : null, plugin.license].filter(Boolean).join(" · ") }),
              createElement("p", { className: "yapmod-plugin-card-description", text: plugin.description ?? "No description provided." }),
              ...(plugin.tags?.length ? [createElement("div", { className: "yapmod-plugin-tags", children: plugin.tags.map((tag) => createElement("span", { className: "yapmod-plugin-tag", text: tag })) })] : []),
            ] }),
            createElement("div", { className: "yapmod-plugin-card-foot", children: [createElement("button", { className: "btn small yapmod-plugin-install", text: installed.has(plugin.id) ? "Installed" : "Install", props: { type: "button", disabled: installed.has(plugin.id) }, on: { click: () => void installCommunity(plugin) } })] }),
          ],
        })));
      }
      function setView(next: "installed" | "community"): void {
        view = next;
        const installed = next === "installed";
        installedTab.classList.toggle("yapmod-theme-tab-active", installed);
        communityTab.classList.toggle("yapmod-theme-tab-active", !installed);
        installedTab.setAttribute("aria-selected", String(installed));
        communityTab.setAttribute("aria-selected", String(!installed));
        installedGrid.hidden = !installed;
        communityGrid.hidden = installed;
        installedToolbar.hidden = !installed;
        communityToolbar.hidden = installed;
        if (!installed) void loadCommunity();
      }

      const search = createElement("input", { className: "input yapmod-plugin-search", attrs: { type: "search", placeholder: "Search community plugins", "aria-label": "Search community plugins" }, on: { input: (event) => { searchQuery = (event.currentTarget as HTMLInputElement).value; renderCommunity(); } } });
      const installedToolbar = createElement("div", { className: "yapmod-plugin-toolbar", children: [
        createElement("button", { className: "btn small", text: "Import plugin", props: { type: "button" }, on: { click: () => void importLocal() } }),
        createElement("button", { className: "btn small ghost", text: "Refresh", props: { type: "button" }, on: { click: () => void refreshInstalled() } }),
        createElement("button", { className: "btn small ghost", text: "Open folder", props: { type: "button" }, on: { click: () => void pluginApi.openFolder().catch((error) => setStatus(String(error), true)) } }),
      ] });
      const communityToolbar = createElement("div", { className: "yapmod-plugin-toolbar", props: { hidden: true }, children: [
        search,
        createElement("button", { className: "btn small ghost", text: "Refresh", props: { type: "button" }, on: { click: () => void loadCommunity(true) } }),
        createElement("button", { className: "btn small", text: "Submit a plugin", props: { type: "button" }, on: { click: () => window.open("https://ilyeshdz.github.io/yapmod/docs/submit-a-plugin/", "_blank", "noopener") } }),
      ] });

      host.append(tabs, installedToolbar, communityToolbar, installedGrid, communityGrid, status);
      renderInstalled();
      void refreshInstalled();
      const unsubscribe = pluginApi.onChange(() => {
        if (disposed) return;
        renderInstalled();
        if (view === "community") renderCommunity();
      });
      return () => { disposed = true; unsubscribe(); };
    },
  });
}
