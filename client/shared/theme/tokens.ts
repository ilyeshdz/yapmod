import postcss from "postcss";

/**
 * The colour tokens of a theme.
 *
 * A theme is a stylesheet, but the tokens are what make a theme portable:
 * they are the names yapmod understands, and they are mapped onto the
 * variables of the app the client wraps.
 *
 * The values below are the palette the app ships with. A theme overrides
 * the ones it cares about and inherits the rest.
 */

export type TokenDefinition = {
  /** The name of the token, without the `--ym-` prefix. */
  name: string;
  /** The variable of the wrapped app the token feeds, when there is one. */
  variable: string | null;
  dark: string;
  light: string;
};

const COLOR_TOKENS: TokenDefinition[] = [
  { name: "bg-rail", variable: "--bg-rail", dark: "#141519", light: "#e3e5e8" },
  { name: "bg-side", variable: "--bg-side", dark: "#1b1c21", light: "#f2f3f5" },
  { name: "bg-main", variable: "--bg-main", dark: "#222329", light: "#ffffff" },
  { name: "bg-elev", variable: "--bg-elev", dark: "#2b2c33", light: "#ebedef" },
  { name: "bg-hover", variable: "--bg-hover", dark: "#2f3038", light: "#e6e7ea" },
  { name: "bg-active", variable: "--bg-active", dark: "#383944", light: "#d7d9de" },
  { name: "bg-input", variable: "--bg-input", dark: "#2d2e36", light: "#ebedef" },
  { name: "bg-float", variable: "--bg-float", dark: "#1b1c21", light: "#ffffff" },
  { name: "text", variable: "--text", dark: "#ececf1", light: "#1d1f23" },
  { name: "text-muted", variable: "--text-muted", dark: "#9c9daa", light: "#5b5d66" },
  { name: "text-faint", variable: "--text-faint", dark: "#6e6f7b", light: "#8b8d96" },
  { name: "border", variable: "--border", dark: "#ffffff12", light: "#00000017" },
  { name: "accent", variable: "--accent", dark: "#ff6b4a", light: "#ff6b4a" },
  { name: "accent-hover", variable: "--accent-hover", dark: "#ff5a35", light: "#ff5a35" },
  { name: "accent-soft", variable: "--accent-soft", dark: "#ff6b4a29", light: "#ff6b4a24" },
  { name: "on-accent", variable: "--on-accent", dark: "#ffffff", light: "#ffffff" },
  { name: "danger", variable: "--danger", dark: "#f2555a", light: "#f2555a" },
  { name: "success", variable: "--success", dark: "#3fcf82", light: "#3fcf82" },
  { name: "warning", variable: "--warning", dark: "#f5b544", light: "#f5b544" },
  { name: "radius", variable: "--radius", dark: "10px", light: "10px" },
  { name: "shadow", variable: "--shadow", dark: "0 10px 40px #00000073", light: "0 10px 34px #00000029" },
];

/**
 * The tokens of yapmod itself.
 *
 * They have no counterpart in the wrapped app, they only style the parts
 * the client adds itself.
 */
const OWN_TOKENS: TokenDefinition[] = [
  { name: "brand", variable: null, dark: "#f67567", light: "#f67567" },
  { name: "brand-2", variable: null, dark: "#ff8a70", light: "#ff8a70" },
  { name: "brand-3", variable: null, dark: "#ffb25f", light: "#ffb25f" },
  { name: "brand-soft", variable: null, dark: "rgba(246, 117, 103, 0.15)", light: "rgba(246, 117, 103, 0.15)" },
  { name: "brand-hover", variable: null, dark: "rgba(77, 22, 15, 0.14)", light: "rgba(77, 22, 15, 0.14)" },
];

export const TOKENS: TokenDefinition[] = [...COLOR_TOKENS, ...OWN_TOKENS];

/**
 * The names a theme may use, so previews can be built from a stylesheet.
 */
const TOKEN_NAMES = new Set(TOKENS.map((token) => token.name));
const MODE_SELECTORS = {
  dark: /\[\s*data-yapmod-mode\s*=\s*(?:"dark"|'dark'|dark)\s*\]/i,
  light: /\[\s*data-yapmod-mode\s*=\s*(?:"light"|'light'|light)\s*\]/i,
} as const;

/**
 * Variables of the wrapped app that are fed by a token as well.
 */
const EXTRA_VARIABLES: { variable: string; token: string }[] = [
  { variable: "--bg-side-solid", token: "bg-side" },
  { variable: "--bg-floating", token: "bg-float" },
];

function declarations(tokens: TokenDefinition[], mode: "dark" | "light"): string {
  return tokens
    .map((token) => `  --ym-${token.name}: ${token[mode]};`)
    .join("\n");
}

/**
 * The stylesheet that turns the tokens into the variables of the app.
 *
 * The defaults live in a layer, so a theme beats them with a plain rule,
 * whatever its specificity. The mapping from a token to a variable of the
 * app sits outside the layer, because it has to win from the stylesheet
 * of the app itself.
 *
 * Only the tokens a theme actually sets are mapped. The rest is left to
 * the app, so its own palette keeps working.
 */
export function buildTokenLayer(themeId: string, css = ""): string {
  const { tokens, variables, modes } = readDeclarations(css);
  const definedTokens = {
    ...tokens,
    ...modes.dark,
    ...modes.light,
  };

  const mapped: string[] = [];

  for (const token of TOKENS) {
    if (!token.variable) {
      continue;
    }

    // A theme that sets the variable of the app itself is left alone.
    if (variables[token.name] !== undefined) {
      continue;
    }

    if (definedTokens[token.name] === undefined) {
      continue;
    }

    mapped.push(`  ${token.variable}: var(--ym-${token.name});`);

    // A few variables of the app follow another token.
    for (const extra of EXTRA_VARIABLES) {
      if (extra.token === token.name) {
        mapped.push(`  ${extra.variable}: var(--ym-${extra.token});`);
      }
    }
  }

  const defaults = `@layer yapmod-defaults {
:root[data-yapmod-mode="dark"] {
${declarations(TOKENS, "dark")}
}

:root[data-yapmod-mode="light"] {
${declarations(TOKENS, "light")}
}
}`;

  if (mapped.length === 0) {
    return `${defaults}\n`;
  }

  const mapping = `:root[data-yapmod-theme="${themeId}"][data-yapmod-mode="dark"],
:root[data-yapmod-theme="${themeId}"][data-yapmod-mode="light"] {
${mapped.join("\n")}
}`;

  return `${defaults}\n\n${mapping}\n`;
}

/**
 * Reads the tokens a stylesheet sets.
 *
 * Both `--ym-bg-rail` and `--bg-rail` count, so a theme can use the tokens
 * of yapmod or the variables of the app directly.
 *
 * When a mode is given, the tokens of that mode win. A theme usually has
 * a block for the dark mode and one for the light one, and the one that
 * comes last is not the one that is on screen.
 */
export function readTokens(
  css: string,
  mode?: "dark" | "light",
): Record<string, string> {
  const { tokens, modes } = readDeclarations(css);

  if (!mode) {
    return tokens;
  }

  return { ...tokens, ...modes[mode] };
}

/**
 * The palette of the app itself.
 *
 * It is read from the stylesheet of the app, not from the page, because a
 * theme replaces the values of the page. That way the card of the app's
 * own theme keeps showing the look the app ships with.
 */
export function appPalette(mode: "dark" | "light"): Record<string, string> {
  const values: Record<string, string> = {};
  const wanted = mode === "light" ? ":root[data-theme=light]" : ":root";

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;

    try {
      rules = sheet.cssRules;
    } catch {
      // A stylesheet of another site cannot be read.
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }

      if (rule.selectorText !== wanted) {
        continue;
      }

      for (const name of TOKEN_NAMES) {
        const value = rule.style.getPropertyValue(`--${name}`).trim();

        if (value) {
          values[name] = value;
        }
      }
    }
  }

  return values;
}

type Declarations = {
  /** The tokens of yapmod, from `--ym-` variables. */
  tokens: Record<string, string>;
  /** The variables of the app, set by their own name. */
  variables: Record<string, string>;
  /** Token values scoped to each yapmod color mode. */
  modes: Record<"dark" | "light", Record<string, string>>;
};

function readDeclarations(css: string): Declarations {
  const tokens: Record<string, string> = {};
  const variables: Record<string, string> = {};
  const modes: Declarations["modes"] = { dark: {}, light: {} };
  let root: ReturnType<typeof postcss.parse>;

  try {
    root = postcss.parse(css, { from: undefined });
  } catch {
    // Leave malformed CSS to the browser's stylesheet parser. Token mapping
    // is optional, so one bad declaration should not stop theme injection.
    return { tokens, variables, modes };
  }

  root.walkDecls((declaration) => {
    const name = declaration.prop.startsWith("--")
      ? declaration.prop.slice(2)
      : "";
    const value = declaration.value.trim();
    const tokenName = name.startsWith("ym-") ? name.slice(3) : name;

    if (!TOKEN_NAMES.has(tokenName)) {
      return;
    }

    if (name.startsWith("ym-")) {
      const mode = modeForDeclaration(declaration);

      if (mode) {
        modes[mode][tokenName] = value;
      } else {
        tokens[tokenName] = value;
      }
    } else {
      variables[tokenName] = value;
    }
  });

  return { tokens, variables, modes };
}

function modeForDeclaration(
  declaration: postcss.Declaration,
): "dark" | "light" | null {
  let parent = declaration.parent;

  while (parent && parent.type !== "root") {
    if (parent.type === "rule") {
      const selector = parent.selector;

      for (const mode of ["dark", "light"] as const) {
        if (MODE_SELECTORS[mode].test(selector)) {
          return mode;
        }
      }
    }

    parent = parent.parent;
  }

  return null;
}
