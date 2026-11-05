import type { ResolvedMode, ThemeBundle } from "./types";
import { buildTokenLayer } from "./tokens";
import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";

const THEME_STYLE_ID = "yapmod-theme-styles";

/**
 * The keys the wrapped app keeps its own theme in.
 *
 * The app reads them while the page is still loading, so mirroring the
 * choice is what keeps the theme from flashing on the first frame.
 */
const HOST_THEME_KEY = "yapper-theme";

export type ThemeListener = (theme: ThemeBundle | null) => void;

/**
 * The part of the theme API that applies and observes themes.
 *
 * Reading, installing and removing packages lives in `repository.ts`, so the
 * renderer does not depend on how a target stores packages.
 */
export type YapmodThemeEngineApi = {
  /** The theme that is applied. */
  readonly active: ThemeBundle | null;
  apply(theme: ThemeBundle | null): void;
  onChange(listener: ThemeListener): () => void;
};

let activeTheme: ThemeBundle | null = null;
const listeners = new Set<ThemeListener>();

let savedHostTheme: string | null = null;
let hostStateSaved = false;

/**
 * Initialization scripts can run before the browser has created <html>.
 * Wait for the document lifecycle to advance, then run the deferred work.
 */
function whenDocumentElementReady(callback: () => void): void {
  if (document.documentElement) {
    callback();
    return;
  }

  const check = (): void => {
    if (!document.documentElement) {
      return;
    }

    document.removeEventListener("readystatechange", check);
    document.removeEventListener("DOMContentLoaded", check);
    callback();
  };

  document.addEventListener("readystatechange", check);
  document.addEventListener("DOMContentLoaded", check);
}

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
 * Splits the `@import` rules that open a stylesheet from the rest.
 *
 * The engine mounts the generated token layer before the theme, and CSS only
 * honours `@import` before every other rule. Lifting the leading imports out
 * lets a theme use `@import` even though its rules no longer come first.
 */
function splitLeadingImports(css: string): { imports: string; sheet: string } {
  let index = 0;
  const imports: string[] = [];

  while (index < css.length) {
    while (index < css.length && /\s/.test(css[index])) {
      index += 1;
    }

    if (css.startsWith("/*", index)) {
      const end = css.indexOf("*/", index + 2);

      if (end === -1) {
        break;
      }

      index = end + 2;
      continue;
    }

    if (!/^@import\b/i.test(css.slice(index))) {
      break;
    }

    let end = index;
    let quote: string | null = null;
    let depth = 0;

    while (end < css.length) {
      const character = css[end];

      if (quote) {
        if (character === "\\") {
          end += 2;
          continue;
        }

        if (character === quote) {
          quote = null;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth = Math.max(0, depth - 1);
      } else if (character === ";" && depth === 0) {
        end += 1;
        break;
      }

      end += 1;
    }

    imports.push(css.slice(index, end));
    index = end;
  }

  if (imports.length === 0) {
    return { imports: "", sheet: css };
  }

  return {
    imports: imports.join("\n"),
    sheet: css.slice(index).trimStart(),
  };
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
  if (!document.documentElement) {
    whenDocumentElementReady(() => render(activeTheme));
    return;
  }

  const root = document.documentElement;

  if (!theme) {
    delete root.dataset.yapmodTheme;
    delete root.dataset.yapmodMode;
    mount("");
    restoreHostState();
    return;
  }

  const mode = resolveMode(theme);
  const { imports, sheet } = splitLeadingImports(theme.css);

  root.dataset.yapmodTheme = theme.id;
  root.dataset.yapmodMode = mode;

  mount(
    `${imports ? `${imports}\n` : ""}${buildTokenLayer(theme.id, theme.css)}\n${sheet}`,
  );

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
  if (!document.documentElement) {
    whenDocumentElementReady(applyCurrentState);
    return;
  }

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
        const themes = (await getHost().themes?.list()) ?? [];
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
  const root = document.documentElement;

  if (!root) {
    whenDocumentElementReady(watchHost);
    return;
  }

  const observer = new MutationObserver(() => {
    applyCurrentState();
  });

  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function installThemeEngine(theme: ThemeBundle | null): YapmodThemeEngineApi {
  activeTheme = theme;

  const api: YapmodThemeEngineApi = {
    get active(): ThemeBundle | null {
      return activeTheme;
    },

    apply(theme: ThemeBundle | null): void {
      activeTheme = theme;
      render(theme);
      notify();
    },

    onChange(listener: ThemeListener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  if (theme) {
    render(theme);
  }

  watchSystem();
  watchStore();
  watchHost();

  return api;
}
