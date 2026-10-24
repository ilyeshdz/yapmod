import { Show, JSX } from "solid-js";

import type { ThemeBundle } from "./types";
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

function radiusOf(value: string): number {
  const radius = Number.parseFloat(value);

  return Number.isFinite(radius) ? Math.min(Math.max(radius, 0), 8) : 4;
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
      active:
        palette["bg-active"] ?? appValue("bg-active", fallback("bg-active")),
      input: palette["bg-input"] ?? appValue("bg-input", fallback("bg-input")),
      text: palette["text"] ?? appValue("text", fallback("text")),
      muted:
        palette["text-muted"] ?? appValue("text-muted", fallback("text-muted")),
      border: palette["border"] ?? appValue("border", fallback("border")),
      accent: palette["accent"] ?? appValue("accent", fallback("accent")),
      accentSoft:
        palette["accent-soft"] ??
        appValue("accent-soft", fallback("accent-soft")),
      radius: radiusOf(
        palette["radius"] ?? appValue("radius", fallback("radius")),
      ),
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

/** Renders a theme's own image, or a small preview from its color tokens. */
export function ThemePreview(
  props: { theme: ThemeBundle | null },
): JSX.Element {
  const colors = swatchesOf(props.theme);

  return (
    <Show
      when={props.theme?.preview}
      fallback={
        <span class="yapmod-theme-preview">
          <span
            class="yapmod-theme-preview-rail"
            style={{ background: colors.rail }}
          >
            <span
              class="yapmod-theme-preview-dot"
              style={{ background: colors.accent }}
            />
            <span
              class="yapmod-theme-preview-dot"
              style={{ background: colors.elev, opacity: "0.8" }}
            />
          </span>
          <span
            class="yapmod-theme-preview-side"
            style={{ background: colors.side }}
          >
            <span
              class="yapmod-theme-preview-line"
              style={{ background: colors.muted, opacity: "0.55" }}
            />
            <span
              class="yapmod-theme-preview-line"
              style={{ background: colors.active, width: "80%" }}
            />
            <span
              class="yapmod-theme-preview-line"
              style={{
                background: colors.muted,
                opacity: "0.35",
                width: "70%",
              }}
            />
          </span>
          <span
            class="yapmod-theme-preview-main"
            style={{ background: colors.main }}
          >
            <span class="yapmod-theme-preview-head">
              <span
                class="yapmod-theme-preview-title"
                style={{ background: colors.text, opacity: "0.75" }}
              />
              <span
                class="yapmod-theme-preview-badge"
                style={{ background: colors.accent }}
              />
            </span>
            <span
              class="yapmod-theme-preview-bubble"
              style={{
                background: colors.elev,
                border: `1px solid ${colors.border}`,
                "border-radius": `${colors.radius}px`,
              }}
            />
            <span
              class="yapmod-theme-preview-bubble mine"
              style={{
                background: colors.accentSoft,
                "border-radius": `${colors.radius}px`,
              }}
            />
            <span
              class="yapmod-theme-preview-input"
              style={{
                background: colors.input,
                border: `1px solid ${colors.border}`,
                "border-radius": `${colors.radius}px`,
              }}
            />
          </span>
        </span>
      }
    >
      <span class="yapmod-theme-preview">
        <img src={props.theme!.preview!} alt="" />
      </span>
    </Show>
  );
}
