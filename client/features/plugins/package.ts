import type { PluginBundle, PluginManifest } from "../../shared/types";

/**
 * Validation shared by every target.
 *
 * Packages arrive from a catalog, a local folder, or extension storage. The
 * checks are environment independent, so a target can reject a bad package
 * before it writes it to its own storage.
 */

export function validatePluginManifest(manifest: PluginManifest): void {
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
  if (
    !Array.isArray(manifest.tags) ||
    manifest.tags.length > 12 ||
    manifest.tags.some(
      (tag) => typeof tag !== "string" || tag.length > 32,
    )
  ) {
    throw new Error("The plugin tags are invalid or too long.");
  }
  if (!Array.isArray(manifest.settings) || manifest.settings.length > 12) {
    throw new Error("The plugin settings list is invalid or too long.");
  }
  const ids = new Set<string>();
  for (const setting of manifest.settings) {
    if (!setting || !/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(setting.id) || ids.has(setting.id) ||
        typeof setting.label !== "string" || !setting.label.trim() || setting.label.length > 80 ||
        (setting.description !== undefined && (typeof setting.description !== "string" || setting.description.length > 200))) {
      throw new Error("The plugin contains an invalid or duplicate setting.");
    }
    const validTypes = ["toggle", "text", "file", "color"];
    if (!validTypes.includes(setting.type)) {
      throw new Error("The plugin contains an invalid or duplicate setting.");
    }
    if (
      "accept" in setting &&
      setting.accept !== undefined &&
      typeof setting.accept !== "string"
    ) {
      throw new Error("The plugin contains an invalid or duplicate setting.");
    }
    // Validate default value matches the setting type
    if (setting.type === "toggle") {
      if (typeof setting.default !== "boolean") {
        throw new Error("The plugin contains an invalid or duplicate setting.");
      }
    } else {
      // text, file, color: default must be string or null
      if (setting.default !== null && typeof setting.default !== "string") {
        throw new Error("The plugin contains an invalid or duplicate setting.");
      }
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

export function validatePluginCss(css: string): void {
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

export function validatePluginBundle(bundle: PluginBundle): void {
  validatePluginManifest(bundle.manifest);
  validatePluginCss(bundle.css);
  if (bundle.script !== null && (typeof bundle.script !== "string" || new TextEncoder().encode(bundle.script).length > 512 * 1024)) {
    throw new Error("The plugin script is invalid or larger than 512 KB.");
  }
}

/** Compares manifests without depending on the key order of the source JSON. */
export function samePluginManifest(
  left: PluginManifest,
  right: PluginManifest,
): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
