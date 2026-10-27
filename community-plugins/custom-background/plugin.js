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
     * Injects a <style> tag that overrides --ym-bg-* CSS custom properties
     * with translucent versions of the default dark theme colors so the
     * background image shows through panels.
     *
     * The base colors come from the default dark theme palette (tokens.ts):
     *   bg-rail:  #141519  ->  #141519cc (80% opaque)
     *   bg-side:  #1b1c21  ->  #1b1c21b3 (70% opaque)
     *   bg-main:  #222329  ->  #22232959 (35% opaque)
     *   bg-elev:  #2b2c33  ->  #2b2c33d9 (85% opaque)
     *   bg-hover: #2f3038  ->  #2f3038e6 (90% opaque)
     *   bg-active:#383944  ->  #383944f2 (95% opaque)
     *   bg-input: #2d2e36  ->  #2d2e36e6 (90% opaque)
     *   bg-float: #1b1c21  ->  #1b1c21f2 (95% opaque)
     *
     * If an accent color is set, it is applied alongside the panel colors.
     */
    function injectPanelStyles(accentColor) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "custom-background-panels";
        document.head.appendChild(styleEl);
      }

      let css = `
        html.yapmod-custom-bg {
          --ym-bg-rail: #141519cc;
          --ym-bg-side: #1b1c21b3;
          --ym-bg-main: #22232959;
          --ym-bg-elev: #2b2c33d9;
          --ym-bg-hover: #2f3038e6;
          --ym-bg-active: #383944f2;
          --ym-bg-input: #2d2e36e6;
          --ym-bg-float: #1b1c21f2;
        }
      `;

      // If a custom accent color is provided, override the accent tokens
      if (accentColor && accentColor !== "#ff6b4a") {
        const hover = lighten(accentColor, -15);
        const soft = accentColor + "29";
        css += `
          html.yapmod-custom-bg {
            --ym-accent: ${accentColor};
            --ym-accent-hover: ${hover};
            --ym-accent-soft: ${soft};
          }
        `;
      }

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
        api.log.warn("Could not load background image");
        clearBackground();
        return;
      }

      // Mark the document so our CSS custom properties only apply when active
      document.documentElement.classList.add("yapmod-custom-bg");

      // Create the background div and set the image on it
      ensureBgDiv();
      bgDiv.style.backgroundImage = `url("${blobUrl}")`;

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
      if (bgDiv) {
        bgDiv.remove();
        bgDiv = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      // The blob URL is automatically revoked by the API when the plugin is disabled.
      // We just clear the cache here so a new image is loaded on re-enable.
      cachedBlobUrl = null;
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
