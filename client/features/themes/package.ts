import type { ThemeBundle, ThemeManifest, ThemeMode } from "./types";

/**
 * The rules a theme manifest must follow.
 *
 * The desktop client reads the same limits from `community-themes/rules.json`;
 * these constants let the browser target validate local folders without the
 * Rust side.
 */
export const THEME_API = 1;
export const DEFAULT_THEME_CSS = "theme.css";
export const MAX_THEME_NAME_LENGTH = 120;
export const MAX_THEME_TAGS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function isValidThemeId(id: string): boolean {
  return (
    id.length > 0 &&
    !id.startsWith(".") &&
    [...id].every((character) => /[a-zA-Z0-9._-]/.test(character))
  );
}

export function isValidThemeFileName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("..") &&
    [...name].every((character) => /[a-zA-Z0-9._-]/.test(character))
  );
}

export function normalizeThemeMode(mode: string | null | undefined): ThemeMode {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  return "both";
}

/**
 * Rebuilds a manifest with the defaults the Rust side applies, then validates
 * it. Catalog entries also carry fields that are not part of the manifest, so
 * the object is copied field by field.
 */
export function normalizeThemeManifest(value: unknown): ThemeManifest {
  if (!isRecord(value)) {
    throw new Error("The theme manifest must be an object.");
  }

  const manifest: ThemeManifest = {
    id: value.id as string,
    name: value.name as string,
    version: optionalString(value.version),
    author: optionalString(value.author),
    description: optionalString(value.description),
    license: optionalString(value.license),
    mode: optionalString(value.mode),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    api: typeof value.api === "number" ? value.api : null,
    preview: optionalString(value.preview),
    css: optionalString(value.css),
  };

  validateThemeManifest(manifest);

  return manifest;
}

export function validateThemeManifest(manifest: ThemeManifest): void {
  if (typeof manifest.id !== "string" || !isValidThemeId(manifest.id)) {
    throw new Error("The theme manifest has no usable id.");
  }

  if (
    typeof manifest.name !== "string" ||
    manifest.name.trim().length === 0 ||
    [...manifest.name].length > MAX_THEME_NAME_LENGTH
  ) {
    throw new Error("The theme manifest has an invalid name.");
  }

  if (
    manifest.api !== null &&
    (typeof manifest.api !== "number" ||
      !Number.isInteger(manifest.api) ||
      manifest.api < 1 ||
      manifest.api > THEME_API)
  ) {
    throw new Error("The theme was written for a newer theme API.");
  }

  if (!Array.isArray(manifest.tags)) {
    throw new Error("The theme manifest has invalid tags.");
  }

  if (manifest.css !== null && !isValidThemeFileName(manifest.css)) {
    throw new Error("The theme manifest points at an unusable stylesheet.");
  }

  if (manifest.preview !== null && !isValidThemeFileName(manifest.preview)) {
    throw new Error("The theme manifest points at an unusable preview.");
  }
}

/** A bundle is valid when its manifest is valid and its CSS is text. */
export function validateThemeBundle(bundle: ThemeBundle): void {
  if (typeof bundle.css !== "string") {
    throw new Error("The theme has no stylesheet.");
  }

  if (
    bundle.preview !== null &&
    (typeof bundle.preview !== "string" ||
      !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/.test(
        bundle.preview,
      ))
  ) {
    throw new Error("The theme preview is not a valid image.");
  }

  validateThemeManifest({
    id: bundle.id,
    name: bundle.name,
    version: bundle.version,
    author: bundle.author,
    description: bundle.description,
    license: bundle.license,
    mode: bundle.mode,
    tags: bundle.tags,
    api: THEME_API,
    preview: null,
    css: null,
  });
}
