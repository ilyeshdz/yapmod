import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";
import { removeStyle, upsertStyle } from "../../shared/ui";
import { resolveMode } from "../themes/engine";

const STYLE_ID = "yapmod-transparency";
const BANNER_ID = "yapmod-transparency";
const BASE_CSS = "html, body { background: transparent !important; }";

/**
 * Makes the surfaces of an otherwise opaque theme translucent.
 *
 * A theme only ever controls the `--ym-*` tokens. The theme engine maps those
 * onto the host app's `--bg-*` variables, and the app paints with `--bg-*`.
 * Overriding the tokens themselves would do nothing when no theme is active,
 * so the forced values are written to the `--bg-*` variables instead, using
 * the theme's token as the colour source and a transparent mix for the alpha.
 *
 * The base level (from the slider) is adjusted per surface so the hierarchy
 * is preserved:
 *   Rail   base-5 %  ·  Side   base-5 %  ·  Main   base-15 %  ·  Elev   base+10 %
 *   Input  base-10 % ·  Float  base+20 % ·  Hover  base+10 % ·  Active base+20 %
 */
type Surface = {
  variable: string;
  token: string;
  dark: string;
  light: string;
  percent: number;
};

function buildForceThemesCss(level: number): string {
  const base = Math.min(80, Math.max(5, Math.round(level)));
  const clamp = (value: number): number => Math.min(90, Math.max(5, value));

  const surfaces: Surface[] = [
    {
      variable: "--bg-rail",
      token: "--ym-bg-rail",
      dark: "#141519",
      light: "#e3e5e8",
      percent: clamp(base - 5),
    },
    {
      variable: "--bg-side",
      token: "--ym-bg-side",
      dark: "#1b1c21",
      light: "#f2f3f5",
      percent: clamp(base - 5),
    },
    {
      variable: "--bg-main",
      token: "--ym-bg-main",
      dark: "#222329",
      light: "#ffffff",
      percent: clamp(base - 15),
    },
    {
      variable: "--bg-elev",
      token: "--ym-bg-elev",
      dark: "#2b2c33",
      light: "#ebedef",
      percent: clamp(base + 10),
    },
    {
      variable: "--bg-input",
      token: "--ym-bg-input",
      dark: "#2d2e36",
      light: "#ebedef",
      percent: clamp(base - 10),
    },
    {
      variable: "--bg-float",
      token: "--ym-bg-float",
      dark: "#1b1c21",
      light: "#ffffff",
      percent: clamp(base + 20),
    },
    {
      variable: "--bg-hover",
      token: "--ym-bg-hover",
      dark: "#2f3038",
      light: "#e6e7ea",
      percent: clamp(base + 10),
    },
    {
      variable: "--bg-active",
      token: "--ym-bg-active",
      dark: "#383944",
      light: "#d7d9de",
      percent: clamp(base + 20),
    },
    // Two variables of the host app have no matching yapmod token.
    {
      variable: "--bg-side-solid",
      token: "--ym-bg-side",
      dark: "#1b1c21",
      light: "#f2f3f5",
      percent: clamp(base - 5),
    },
    {
      variable: "--bg-floating",
      token: "--ym-bg-float",
      dark: "#1b1c21",
      light: "#ffffff",
      percent: clamp(base + 20),
    },
  ];

  const declarations = (mode: "dark" | "light"): string =>
    surfaces
      .map(
        (surface) =>
          `  ${surface.variable}: color-mix(in srgb, var(${surface.token}, ${surface[mode]}) ${surface.percent}%, transparent) !important;`,
      )
      .join("\n");

  const root =
    'html[data-yapmod-transparency="true"][data-yapmod-transparency-force-themes="true"]';

  return `
${root} {
${declarations("dark")}
}

${root}[data-theme="light"] {
${declarations("light")}
}
`;
}

function forceThemes(): boolean {
  return (
    getYapmod().store?.get<boolean>("transparency_force_themes", false) ?? false
  );
}

function transparencyLevel(): number {
  const value =
    getYapmod().store?.get<number>("transparency_level", 30) ?? 30;

  return Number.isFinite(value) ? value : 30;
}

function nativeSupported(): boolean {
  const os = getYapmod().os;
  return os === "macos" || os === "windows";
}

/**
 * Paints the window background transparent so the native effect can show
 * through. Elevated surfaces stay opaque through `minimum.css`.
 *
 * When `force` is set, a second stylesheet also tints the theme's own opaque
 * surfaces so every theme works with transparency.
 */
export function applyTransparencyCss(enabled: boolean, force = false): void {
  const root = document.documentElement;

  if (!root) {
    return;
  }

  if (enabled) {
    root.dataset.yapmodTransparency = "true";

    if (force) {
      root.dataset.yapmodTransparencyForceThemes = "true";
      const level = transparencyLevel();
      upsertStyle(STYLE_ID, `${BASE_CSS}\n${buildForceThemesCss(level)}`);
      return;
    }

    delete root.dataset.yapmodTransparencyForceThemes;
    upsertStyle(STYLE_ID, BASE_CSS);
    return;
  }

  delete root.dataset.yapmodTransparency;
  delete root.dataset.yapmodTransparencyForceThemes;
  removeStyle(STYLE_ID);
}

/** Applies the stored transparency mode before the first frame is painted. */
export function applyStoredTransparencyCss(): void {
  const enabled =
    getYapmod().store?.get<boolean>("enable_transparency", false) ?? false;

  applyTransparencyCss(enabled && nativeSupported(), enabled && forceThemes());
}

/**
 * The darkness the native effect should follow.
 *
 * `undefined` means the operating system decides.
 */
function nativeDark(): boolean | undefined {
  const yapmod = getYapmod();
  const theme = yapmod.theme?.active;

  if (theme) {
    return resolveMode(theme) === "dark";
  }

  const mode = yapmod.store?.get<string>("theme_mode", "system");
  return mode === "dark" ? true : mode === "light" ? false : undefined;
}

function reportFailure(error: unknown): void {
  console.error("[yapmod] could not apply window transparency", error);

  try {
    getYapmod().banner?.show({
      id: BANNER_ID,
      message:
        "Window transparency could not be applied on this system. It has been turned off.",
      tone: "warning",
    });
  } catch {
    // The banner is only a convenience; the setting is already off.
  }
}

async function syncNative(enabled: boolean): Promise<void> {
  const appearance = getHost().appearance;

  if (!appearance) {
    return;
  }

  try {
    const status = await appearance.setTransparency(enabled, nativeDark());

    if (enabled && !status.supported) {
      throw new Error("the window effect is not supported");
    }
  } catch (error) {
    const store = getYapmod().store;

    // Leaving the page transparent without a native blur would show the
    // desktop through the app, so fall back to a solid background.
    applyTransparencyCss(false);

    if (store?.get<boolean>("enable_transparency", false)) {
      store.set("enable_transparency", false);
    }

    reportFailure(error);
  }
}

/**
 * Keeps the CSS and the native effect in step with the setting.
 *
 * Call this after the store and theme APIs are installed. The initial CSS is
 * applied earlier by `applyStoredTransparencyCss` so the first frame is right.
 */
export function installTransparency(): void {
  const store = getYapmod().store;

  const updateCss = (): void => {
    const enabled = store?.get<boolean>("enable_transparency", false) ?? false;
    const usable = enabled && nativeSupported();

    applyTransparencyCss(usable, usable && forceThemes());
    void syncNative(usable);
  };

  store?.onChange("enable_transparency", updateCss);
  store?.onChange("transparency_force_themes", updateCss);
  store?.onChange("transparency_level", updateCss);

  // Only Windows tints the effect by mode. Re-applying the macOS material on
  // every theme change would needlessly blink the window.
  if (getYapmod().os === "windows") {
    const reapply = (): void => {
      if (store?.get<boolean>("enable_transparency", false)) {
        void syncNative(true);
      }
    };

    store?.onChange("theme_mode", reapply);
    store?.onChange("theme_id", reapply);
  }

  // Apply the native window effect on startup. The CSS was already applied
  // earlier by applyStoredTransparencyCss(), but the native effect (macOS
  // vibrancy / Windows Mica) needs the host to be ready, which happens here.
  updateCss();
}
