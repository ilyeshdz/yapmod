import type { YapmodModal } from "../types";
import type { ThemeBundle } from "./types";
import { createElement } from "../ui";
import { getYapmod } from "../../core/scope";
import { resolveMode } from "./engine";
import { appPalette, readTokens, TOKENS } from "./tokens";

/** The colour a token falls back to. */
function fallback(name: string): string {
  return TOKENS.find((token) => token.name === name)?.dark ?? "transparent";
}

/** The value the app uses for one of its variables right now. */
function appValue(name: string, fallbackValue: string): string {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${name}`)
      .trim();

    return value || fallbackValue;
  } catch {
    return fallbackValue;
  }
}

/** The mode the app is in right now. */
function appMode(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

type Swatches = {
  rail: string;
  side: string;
  main: string;
  elev: string;
  active: string;
  input: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  radius: number;
};

function swatchesOf(theme: ThemeBundle | null): Swatches {
  const mode = theme ? resolveMode(theme) : appMode();

  if (!theme) {
    const palette = appPalette(mode);

    return {
      rail: palette["bg-rail"] ?? appValue("bg-rail", fallback("bg-rail")),
      side: palette["bg-side"] ?? appValue("bg-side", fallback("bg-side")),
      main: palette["bg-main"] ?? appValue("bg-main", fallback("bg-main")),
      elev: palette["bg-elev"] ?? appValue("bg-elev", fallback("bg-elev")),
      active: palette["bg-active"] ?? appValue("bg-active", fallback("bg-active")),
      input: palette["bg-input"] ?? appValue("bg-input", fallback("bg-input")),
      text: palette["text"] ?? appValue("text", fallback("text")),
      muted: palette["text-muted"] ?? appValue("text-muted", fallback("text-muted")),
      border: palette["border"] ?? appValue("border", fallback("border")),
      accent: palette["accent"] ?? appValue("accent", fallback("accent")),
      accentSoft:
        palette["accent-soft"] ?? appValue("accent-soft", fallback("accent-soft")),
      radius: radiusOf(palette["radius"] ?? appValue("radius", fallback("radius"))),
    };
  }

  const tokens = readTokens(theme.css, mode);
  const pick = (name: string, variable: string): string =>
    tokens[name] ?? appValue(variable, fallback(name));

  return {
    rail: pick("bg-rail", "bg-rail"),
    side: pick("bg-side", "bg-side"),
    main: pick("bg-main", "bg-main"),
    elev: pick("bg-elev", "bg-elev"),
    active: pick("bg-active", "bg-active"),
    input: pick("bg-input", "bg-input"),
    text: pick("text", "text"),
    muted: pick("text-muted", "text-muted"),
    border: pick("border", "border"),
    accent: pick("accent", "accent"),
    accentSoft: pick("accent-soft", "accent-soft"),
    radius: radiusOf(pick("radius", "radius")),
  };
}

function radiusOf(value: string): number {
  const radius = Number.parseFloat(value);

  return Number.isFinite(radius) ? Math.min(Math.max(radius, 0), 8) : 4;
}

function block(
  className: string,
  style: Record<string, string>,
  children: Node[] = [],
): HTMLElement {
  const element = createElement("span", { className });

  element.setAttribute(
    "style",
    Object.entries(style)
      .map(([name, value]) => `${name}: ${value}`)
      .join("; "),
  );

  element.append(...children);

  return element;
}

/** Renders a theme's own image, or a small preview from its color tokens. */
export function createPreview(theme: ThemeBundle | null): HTMLElement {
  if (theme?.preview) {
    return createElement("span", {
      className: "yapmod-theme-preview",
      children: [
        createElement("img", { attrs: { src: theme.preview, alt: "" } }),
      ],
    });
  }

  const colors = swatchesOf(theme);
  const rail = block("yapmod-theme-preview-rail", { background: colors.rail }, [
    block("yapmod-theme-preview-dot", { background: colors.accent }),
    block("yapmod-theme-preview-dot", { background: colors.elev, opacity: "0.8" }),
  ]);
  const side = block("yapmod-theme-preview-side", { background: colors.side }, [
    block("yapmod-theme-preview-line", { background: colors.muted, opacity: "0.55" }),
    block("yapmod-theme-preview-line", { background: colors.active, width: "80%" }),
    block("yapmod-theme-preview-line", { background: colors.muted, opacity: "0.35", width: "70%" }),
  ]);
  const main = block("yapmod-theme-preview-main", { background: colors.main }, [
    block("yapmod-theme-preview-head", {}, [
      block("yapmod-theme-preview-title", { background: colors.text, opacity: "0.75" }),
      block("yapmod-theme-preview-badge", { background: colors.accent }),
    ]),
    block("yapmod-theme-preview-bubble", {
      background: colors.elev,
      border: `1px solid ${colors.border}`,
      borderRadius: `${colors.radius}px`,
    }),
    block("yapmod-theme-preview-bubble mine", {
      background: colors.accentSoft,
      borderRadius: `${colors.radius}px`,
    }),
    block("yapmod-theme-preview-input", {
      background: colors.input,
      border: `1px solid ${colors.border}`,
      borderRadius: `${colors.radius}px`,
    }),
  ]);

  return createElement("span", {
    className: "yapmod-theme-preview",
    children: [rail, side, main],
  });
}

/** Asks before a theme is deleted. */
export function confirmRemove(name: string): Promise<boolean> {
  const modalApi = getYapmod().modal;

  if (!modalApi) {
    return Promise.resolve(window.confirm(`Remove the theme "${name}"?`));
  }

  return new Promise<boolean>((resolve) => {
    modalApi.show({
      title: "Remove theme",
      description: `"${name}" will be deleted from your themes folder.`,
      buttons: [
        { label: "Cancel", variant: "secondary" },
        {
          label: "Remove",
          variant: "danger",
          onClick: (modal: YapmodModal) => {
            resolve(true);
            modal.close("button");
          },
        },
      ],
      onClose: () => resolve(false),
    });
  });
}
