/**
 * Custom Background Plugin
 *
 * Creates a dedicated full-screen div behind all content for the background image,
 * and overrides the --ym-bg-* CSS custom properties so panels become slightly
 * translucent, letting the image show through. The panel colors are the default
 * dark theme values with reduced alpha, matching the Yapmod theme system pattern.
 *
 * A dedicated element is used instead of modifying body styles directly, to avoid
 * layout issues (transform, filter on body breaks the window sizing).
 */

const BG_DIV_ID = "yapmod-custom-bg-div";

/**
 * Panel colours used when the custom background is active.
 *
 * The values mirror the standalone Custom Background theme: the panel tokens
 * stay slightly translucent, and both the `--ym-*` tokens and the wrapped
 * app's own `--bg-*` variables are set. The latter is what makes the image
 * visible even when no yapmod theme is selected (with no theme, nothing maps
 * `--ym-*` onto the app's variables).
 */
const DARK_PALETTE = {
  "bg-rail": "#07080acc",
  "bg-side": "#0d0e12b3",
  "bg-main": "#12131959",
  "bg-elev": "#191b22d9",
  "bg-hover": "#21232ce6",
  "bg-active": "#2a2d38f2",
  "bg-input": "#16171ee6",
  "bg-float": "#0d0e12f2",
  "accent": "#7ee2a8",
  "accent-hover": "#63c78d",
  "accent-soft": "#7ee2a826",
  "on-accent": "#08211a",
  "page": "#07080a",
};

const LIGHT_PALETTE = {
  "bg-rail": "#e7e9eecc",
  "bg-side": "#f1f3f6b3",
  "bg-main": "#fafbfc59",
  "bg-elev": "#ffffffd9",
  "bg-hover": "#eaecf1e6",
  "bg-active": "#dde0e8f2",
  "bg-input": "#ffffffe6",
  "bg-float": "#fffffff2",
  "accent": "#0f9d58",
  "accent-hover": "#0c8149",
  "accent-soft": "#0f9d5822",
  "on-accent": "#ffffff",
  "page": "#f5f6f8",
};

/** Wrapped-app variables that follow the matching `--ym-*` token. */
const APP_VARIABLES = {
  "bg-rail": ["--bg-rail"],
  "bg-side": ["--bg-side", "--bg-side-solid"],
  "bg-main": ["--bg-main"],
  "bg-elev": ["--bg-elev"],
  "bg-hover": ["--bg-hover"],
  "bg-active": ["--bg-active"],
  "bg-input": ["--bg-input"],
  "bg-float": ["--bg-float", "--bg-floating"],
  "accent": ["--accent"],
  "accent-hover": ["--accent-hover"],
  "accent-soft": ["--accent-soft"],
  "on-accent": ["--on-accent"],
};

const DEFAULT_ACCENT = "#7ee2a8";

export default {
  activate(api) {
    // Cache for the blob URL so we don't re-create it on every setting change
    let cachedBlobUrl = null;
    let cachedDataUri = null;
    // Track the injected style element for translucent panel colors
    let styleEl = null;
    // Track the background div element
    let bgDiv = null;

    /**
     * Converts the data URI from the file setting to a blob URL.
     * When the image changes, the old blob URL is explicitly revoked.
     */
    async function loadBackgroundImage(dataUri) {
      if (!dataUri) return null;

      // If the stored value is a legacy file path (not a data URI), the user
      // needs to re-select the file through the settings dialog.
      if (!dataUri.startsWith("data:")) {
        api.log.warn("Background image setting contains a legacy file path; please re-select the file in plugin settings.");
        return null;
      }

      if (cachedDataUri === dataUri && cachedBlobUrl) {
        return cachedBlobUrl;
      }

      // Revoke the previous blob URL before creating a new one
      if (cachedBlobUrl) {
        api.file.revokeObjectURL(cachedBlobUrl);
        cachedBlobUrl = null;
      }

      try {
        const url = await api.file.createBlobUrl(dataUri);
        cachedBlobUrl = url;
        cachedDataUri = dataUri;
        return url;
      } catch (error) {
        api.log.error("Error loading background image:", error);
        return null;
      }
    }

    /**
     * Builds the declarations for one mode's palette.
     *
     * Every token is mirrored onto the app variable it feeds. A yapmod theme
     * normally does that mapping, but the plugin must also work when no theme
     * is selected, which is the common case for a background-only setup.
     *
     * `!important` makes the plugin win over an active theme. Without it a
     * theme rule such as `:root[data-yapmod-mode="dark"]` has a higher
     * specificity than `html.yapmod-custom-bg`.
     */
    function paletteDeclarations(palette, accentColor) {
      const values = { ...palette };

      if (accentColor) {
        values.accent = accentColor;
        values["accent-hover"] = lighten(accentColor, -15);
        values["accent-soft"] = `${accentColor}26`;
      }

      const lines = [];

      for (const [name, value] of Object.entries(values)) {
        if (name === "page") {
          lines.push(`--ym-custom-bg-page: ${value} !important;`);
          continue;
        }

        lines.push(`--ym-${name}: ${value} !important;`);

        for (const variable of APP_VARIABLES[name] || []) {
          lines.push(`${variable}: var(--ym-${name}) !important;`);
        }
      }

      return lines.map((line) => `  ${line}`).join("\n");
    }

    /**
     * Injects a <style> tag that overrides the panel colours so the
     * background image shows through, and applies the selected accent.
     *
     * Dark and light palettes match the standalone Custom Background theme.
     * The active mode comes from yapmod (`data-yapmod-mode`) when a theme is
     * selected, and from the wrapped app (`data-theme`) otherwise.
     */
    function injectPanelStyles(accentColor) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "custom-background-panels";
        document.head.appendChild(styleEl);
      }

      // The manifest's default is already the dark accent, so only override
      // both palettes when the user actually picked a different colour.
      const customAccent =
        accentColor && accentColor.toLowerCase() !== DEFAULT_ACCENT
          ? accentColor
          : null;

      const css = `
        html:root.yapmod-custom-bg {
        ${paletteDeclarations(DARK_PALETTE, customAccent)}
        }

        html:root.yapmod-custom-bg[data-theme="light"],
        html:root.yapmod-custom-bg[data-yapmod-mode="light"] {
        ${paletteDeclarations(LIGHT_PALETTE, customAccent)}
        }

        @media (prefers-color-scheme: light) {
          html:root.yapmod-custom-bg:not([data-theme]):not([data-yapmod-mode]) {
        ${paletteDeclarations(LIGHT_PALETTE, customAccent)}
          }
        }
      `;

      styleEl.textContent = css;
    }

    /**
     * Creates or updates the dedicated background div element.
     */
    function ensureBgDiv() {
      if (bgDiv) return;

      bgDiv = document.createElement("div");
      bgDiv.id = BG_DIV_ID;
      bgDiv.style.position = "fixed";
      bgDiv.style.top = "0";
      bgDiv.style.left = "0";
      bgDiv.style.width = "100vw";
      bgDiv.style.height = "100vh";
      bgDiv.style.zIndex = "-1";
      bgDiv.style.backgroundSize = "cover";
      bgDiv.style.backgroundPosition = "center";
      bgDiv.style.backgroundRepeat = "no-repeat";
      bgDiv.style.backgroundAttachment = "fixed";
      bgDiv.style.pointerEvents = "none";

      // Insert at the beginning of body so it's behind everything
      document.body.insertBefore(bgDiv, document.body.firstChild);
    }

    /**
     * Applies the current settings to the background.
     */
    async function applyBackground() {
      const enabled = api.settings.get("enable-background");
      const imagePath = api.settings.get("background-image");
      const blurAmount = api.settings.get("blur-amount") || "0px";
      const accentColor = api.settings.get("accent-color") || null;

      if (!enabled || !imagePath) {
        clearBackground();
        return;
      }

      const blobUrl = await loadBackgroundImage(imagePath);
      if (!blobUrl) {
        // loadBackgroundImage already logged why the image could not be loaded.
        clearBackground();
        return;
      }

      // Mark the document so our CSS custom properties only apply when active
      document.documentElement.classList.add("yapmod-custom-bg");

      // Expose the image the same way the standalone theme did.
      document.documentElement.style.setProperty(
        "--ym-bg-image",
        `url("${blobUrl}")`,
      );

      // Create the background div and let the stylesheet pick up the image
      ensureBgDiv();

      // Apply blur to the background div, not the body
      if (blurAmount !== "0px" && blurAmount !== "0") {
        bgDiv.style.filter = `blur(${blurAmount})`;
        // Slightly scale up the background div to compensate for blur edges
        bgDiv.style.transform = "scale(1.02)";
      } else {
        bgDiv.style.filter = "";
        bgDiv.style.transform = "";
      }

      // Make panels translucent so the background shows through
      injectPanelStyles(accentColor);
    }

    /**
     * Clears the background and restores the original state.
     */
    function clearBackground() {
      document.documentElement.classList.remove("yapmod-custom-bg");
      document.documentElement.style.removeProperty("--ym-bg-image");
      if (bgDiv) {
        bgDiv.remove();
        bgDiv = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      // The API also revokes blob URLs when the plugin is disabled, but clear
      // them now so turning the background off does not keep the image alive.
      if (cachedBlobUrl) {
        api.file.revokeObjectURL(cachedBlobUrl);
        cachedBlobUrl = null;
      }
      cachedDataUri = null;
    }

    /**
     * Lightens or darkens a hex color by the given amount (-255 to 255).
     */
    function lighten(hex, amount) {
      const clean = hex.replace("#", "");
      const hexValues = clean.length === 3
        ? clean.split("").map((c) => c + c)
        : clean.match(/.{2}/g) || [];

      if (hexValues.length < 3) return hex;

      const r = Math.max(0, Math.min(255, parseInt(hexValues[0], 16) + amount));
      const g = Math.max(0, Math.min(255, parseInt(hexValues[1], 16) + amount));
      const b = Math.max(0, Math.min(255, parseInt(hexValues[2], 16) + amount));

      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    // Subscribe to setting changes
    api.onCleanup(api.settings.onChange("background-image", () => applyBackground()));
    api.onCleanup(api.settings.onChange("blur-amount", () => applyBackground()));
    api.onCleanup(api.settings.onChange("accent-color", () => applyBackground()));
    api.onCleanup(api.settings.onChange("enable-background", () => applyBackground()));

    // Clean up on plugin disable
    api.onCleanup(() => {
      clearBackground();
    });

    // Apply initial background
    applyBackground();

    api.log.info("Custom background plugin activated");
  },
};
