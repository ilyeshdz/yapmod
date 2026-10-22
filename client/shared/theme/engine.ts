import type { ResolvedMode, ThemeBundle } from "./types";
import { buildTokenLayer } from "./tokens";
import { getYapmod } from "../scope";
import { invokeCommand } from "../tauri";

const THEME_STYLE_ID = "yapmod-theme-styles";

/**
 * The keys the wrapped app keeps its own theme in.
 *
 * The app reads them while the page is still loading, so mirroring the
 * choice is what keeps the theme from flashing on the first frame.
 */
const HOST_THEME_KEY = "yapper-theme";

export type ThemeListener = (theme: ThemeBundle | null) => void;

export type YapmodThemeApi = {
  /** The theme that is applied. */
  readonly active: ThemeBundle | null;
  apply(theme: ThemeBundle | null): void;
  list(): Promise<ThemeBundle[]>;
  pickFolder(): Promise<string | null>;
  install(source: string): Promise<ThemeBundle>;
  remove(id: string): Promise<void>;
  folder(): Promise<string>;
  openFolder(): Promise<void>;
  onChange(listener: ThemeListener): () => void;
};

let activeTheme: ThemeBundle | null = null;
const listeners = new Set<ThemeListener>();

let savedHostTheme: string | null = null;
let hostStateSaved = false;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable, the theme still applies for this session.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/**
 * The mode the system asks for.
 */
function systemMode(): ResolvedMode {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

/**
 * The mode a theme ends up in.
 *
 * A theme that only supports one mode has the last word. A theme that
 * supports both follows the setting, which can follow the system.
 */
export function resolveMode(theme: ThemeBundle): ResolvedMode {
  if (theme.mode === "light") {
    return "light";
  }

  if (theme.mode === "dark") {
    return "dark";
  }

  const setting = getYapmod().store?.get<string>("theme_mode", "system");

  if (setting === "dark" || setting === "light") {
    return setting;
  }

  return systemMode();
}

/**
 * Remembers what the wrapped app had, so it can be put back.
 */
function saveHostState(): void {
  if (hostStateSaved) {
    return;
  }

  hostStateSaved = true;
  savedHostTheme = readStorage(HOST_THEME_KEY);
}

/**
 * Puts the wrapped app's own theme back.
 */
function restoreHostState(): void {
  if (!hostStateSaved) {
    return;
  }

  hostStateSaved = false;

  if (savedHostTheme === null) {
    removeStorage(HOST_THEME_KEY);
  } else {
    writeStorage(HOST_THEME_KEY, savedHostTheme);
  }
}

/**
 * Tells the wrapped app about the theme.
 *
 * The mode is mirrored into the app's own storage, because the app applies
 * it while it loads.
 */
function applyToHost(mode: ResolvedMode): void {
  const root = document.documentElement;

  if (root.dataset.theme !== mode) {
    root.dataset.theme = mode;
  }
  writeStorage(HOST_THEME_KEY, mode);

  saveHostState();
}

/**
 * Puts the stylesheet of a theme on the page.
 *
 * The stylesheet is always the last one in the head, so a theme can style
 * the app it is applied to with plain CSS.
 */
function mount(css: string): void {
  document.getElementById(THEME_STYLE_ID)?.remove();

  const style = document.createElement("style");
  style.id = THEME_STYLE_ID;
  style.textContent = css;

  const parent = document.head ?? document.documentElement;

  parent?.appendChild(style);
}

/**
 * Puts a theme on the page.
 */
function render(theme: ThemeBundle | null): void {
  const root = document.documentElement;

  if (!theme) {
    delete root.dataset.yapmodTheme;
    delete root.dataset.yapmodMode;
    mount("");
    restoreHostState();
    return;
  }

  const mode = resolveMode(theme);

  root.dataset.yapmodTheme = theme.id;
  root.dataset.yapmodMode = mode;

  mount(`${buildTokenLayer(theme.id, theme.css)}\n${theme.css}`);

  applyToHost(mode);
}

/**
 * Moves the stylesheet of the theme behind the stylesheets of the app.
 *
 * The theme is applied before the page loads, so the app never shows the
 * wrong colours. When the page is done loading, the stylesheet is put at
 * the end of the head, where it can also override plain CSS.
 */
export function remountThemeStyles(): void {
  const style = document.getElementById(THEME_STYLE_ID);

  if (!style) {
    return;
  }

  mount(style.textContent ?? "");
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener(activeTheme);
    } catch (error) {
      console.error("[yapmod] theme listener failed", error);
    }
  }
}

/**
 * Reads the current state and applies the correct data-theme attribute.
 *
 * All watchers delegate to this function so there is a single source of
 * truth for what data-theme should be, instead of each watcher doing its
 * own partial apply.
 */
function applyCurrentState(): void {
  const theme = activeTheme;
  const store = getYapmod().store;
  const root = document.documentElement;

  if (theme) {
    // An active theme determines the mode.
    const mode = resolveMode(theme);
    if (root.dataset.theme !== mode) {
      root.dataset.theme = mode;
    }
    writeStorage(HOST_THEME_KEY, mode);
  } else {
    // No active theme — follow the mode setting, which can follow the system.
    const mode = store?.get<string>("theme_mode", "system");

    if (mode === "light" || mode === "dark") {
      if (root.dataset.theme !== mode) {
        root.dataset.theme = mode;
      }
      writeStorage(HOST_THEME_KEY, mode);
    } else {
      // System mode — let the host app's own prefers-color-scheme take effect.
      if (root.dataset.theme !== null && root.dataset.theme !== "") {
        delete root.dataset.theme;
      }
      try {
        window.localStorage.removeItem(HOST_THEME_KEY);
      } catch {
        // The root attribute still updates the current page.
      }
    }
  }
}

/**
 * Watches the system, so a theme that follows it stays in step.
 */
function watchSystem(): void {
  try {
    const query = window.matchMedia("(prefers-color-scheme: light)");

    query.addEventListener("change", () => {
      const theme = activeTheme;

      if (theme) {
        render(theme);
      } else {
        applyCurrentState();
      }
    });
  } catch {
    // The system mode stays as it is.
  }
}

/**
 * Watches theme settings. A mode change replaces only yapmod's theme style
 * element and updates the host mode attribute; it never reloads the page.
 */
function watchStore(): void {
  const store = getYapmod().store;

  store?.onChange("theme_mode", () => {
    const theme = activeTheme;

    if (theme) {
      render(theme);
    } else {
      applyCurrentState();
    }
  });

  store?.onChange("theme_id", async () => {
    // When theme_id changes, reload the theme so it renders with the
    // current mode setting and proper data-theme attribute.
    const id = store?.get<string>("theme_id", "") ?? "";

    if (id) {
      try {
        const themes = await invokeCommand<ThemeBundle[]>("list_themes");
        const theme = themes.find((t) => t.id === id);

        if (theme) {
          activeTheme = theme;
          render(theme);
          notify();
        } else {
          // Theme not found, fall back to host state
          activeTheme = null;
          render(null);
          notify();
        }
      } catch {
        // If we can't list themes, keep the current state
      }
    } else {
      // No theme selected, restore host state
      activeTheme = null;
      render(null);
      notify();
    }
  });
}

/**
 * Keeps the app from taking the theme back.
 *
 * The app applies its own theme while it runs, so the mode is put back
 * whenever it changes.
 */
function watchHost(): void {
  const observer = new MutationObserver(() => {
    applyCurrentState();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function installThemeEngine(theme: ThemeBundle | null): void {
  activeTheme = theme;

  const api: YapmodThemeApi = {
    get active(): ThemeBundle | null {
      return activeTheme;
    },

    apply(theme: ThemeBundle | null): void {
      activeTheme = theme;
      render(theme);
      notify();
    },

    list(): Promise<ThemeBundle[]> {
      return invokeCommand<ThemeBundle[]>("list_themes");
    },

    pickFolder(): Promise<string | null> {
      return invokeCommand<string | null>("pick_theme_folder");
    },

    install(source: string): Promise<ThemeBundle> {
      return invokeCommand<ThemeBundle>("install_theme", { source });
    },

    remove(id: string): Promise<void> {
      return invokeCommand<void>("remove_theme", { id });
    },

    folder(): Promise<string> {
      return invokeCommand<string>("themes_folder");
    },

    openFolder(): Promise<void> {
      return invokeCommand<void>("open_themes_folder");
    },

    onChange(listener: ThemeListener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  getYapmod().theme = api;

  if (theme) {
    render(theme);
  }

  watchSystem();
  watchStore();
  watchHost();
}
