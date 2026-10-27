import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const source = join(root, "community-themes");
const rules = JSON.parse(readFileSync(join(source, "rules.json"), "utf8"));
const outputDir = process.argv.includes("--dev") ? "public" : "dist";
const output = resolve(process.cwd(), `${outputDir}/community-themes`);
const validId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;
const manifestFields = new Set([
  "id",
  "name",
  "version",
  "author",
  "description",
  "license",
  "mode",
  "tags",
  "api",
  "preview",
  "css",
]);
const validModes = ["dark", "light", "both"];

function fail(message) {
  throw new Error(`[community themes] ${message}`);
}

function requireFile(folder, name, limit, label) {
  const path = join(source, folder, name);
  const details = lstatSync(path, { throwIfNoEntry: false });
  if (!details?.isFile() || details.isSymbolicLink()) {
    fail(`${folder}: ${label} file is missing or is not a regular file`);
  }
  if (details.size > limit) fail(`${folder}: ${label} exceeds the ${limit} byte limit`);
  return path;
}

function validateCss(css, folder) {
  if (css.includes("\\")) fail(`${folder}: CSS escapes are not supported`);
  let normalized = "";
  let quote;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (quote) {
      if (character === quote) quote = undefined;
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
      if (end < 0) fail(`${folder}: stylesheet has an unfinished comment`);
      index = end + 1;
      continue;
    }
    normalized += character.toLowerCase();
  }
  if (quote) fail(`${folder}: stylesheet has an unfinished string`);

  const isIdentCharacter = (character) =>
    character !== undefined && /[a-z0-9_-]/.test(character);
  let index = 0;
  while (index < normalized.length) {
    if (normalized[index] === "@") {
      const start = index + 1;
      let end = start;
      while (isIdentCharacter(normalized[end])) end += 1;
      if (normalized.slice(start, end) === "import")
        fail(`${folder}: @import is not allowed`);
      index = Math.max(end, index + 1);
      continue;
    }
    if (/[a-z_-]/.test(normalized[index])) {
      const start = index;
      index += 1;
      while (isIdentCharacter(normalized[index])) index += 1;
      const ident = normalized.slice(start, index);
      if (
        ["url", "expression", "image-set", "-webkit-image-set"].includes(ident)
      ) {
        fail(`${folder}: stylesheet contains a blocked external-resource construct`);
      }
      if (ident === "behavior") {
        let next = index;
        while (/\s/.test(normalized[next] ?? "")) next += 1;
        if (normalized[next] === ":")
          fail(`${folder}: the behavior property is not allowed`);
      }
      continue;
    }
    index += 1;
  }
}

const entries = readdirSync(source, { withFileTypes: true })
  .filter(
    (entry) =>
      !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink())
  )
  .sort((left, right) => left.name.localeCompare(right.name));

const themes = [];
const files = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.isSymbolicLink() || !validId.test(entry.name)) {
    fail(`${entry.name}: expected a theme folder with a valid id`);
  }
  const folder = entry.name;
  const manifestPath = requireFile(
    folder,
    "manifest.json",
    rules.maxManifestBytes,
    "manifest"
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`${folder}: manifest.json is invalid JSON (${error})`);
  }

  if (
    !manifest ||
    typeof manifest !== "object" ||
    Object.keys(manifest).some((key) => !manifestFields.has(key))
  ) {
    fail(`${folder}: manifest contains an unsupported field`);
  }

  if (
    !manifest ||
    manifest.id !== folder ||
    typeof manifest.name !== "string" ||
    !manifest.name.trim() ||
    Array.from(manifest.name).length > rules.maxNameLength
  ) {
    fail(`${folder}: manifest id must match the folder and name must be set`);
  }
  if (
    manifest.api !== undefined &&
    (!Number.isInteger(manifest.api) || manifest.api < 0 || manifest.api > rules.themeApi)
  ) {
    fail(`${folder}: theme API must be an integer no newer than ${rules.themeApi}`);
  }
  manifest.tags ??= [];
  manifest.mode ??= "both";
  manifest.api ??= 1;
  if (typeof manifest.author === "string" && manifest.author.length > 100) {
    fail(`${folder}: author is too long`);
  }
  if (
    typeof manifest.description === "string" &&
    manifest.description.length > 500
  ) {
    fail(`${folder}: description is too long`);
  }
  if (typeof manifest.license === "string" && manifest.license.length > 100) {
    fail(`${folder}: license is too long`);
  }
  if (
    !Array.isArray(manifest.tags) ||
    manifest.tags.length > rules.maxTags ||
    manifest.tags.some((tag) => typeof tag !== "string" || tag.length > 32)
  ) {
    fail(`${folder}: tags must be short strings (at most ${rules.maxTags})`);
  }
  if (
    typeof manifest.mode !== "string" ||
    !validModes.includes(manifest.mode)
  ) {
    fail(`${folder}: mode must be one of ${validModes.join(", ")}`);
  }

  // Validate preview file if specified
  let previewPath = null;
  if (manifest.preview) {
    const ext = manifest.preview.split(".").pop().toLowerCase();
    if (!rules.previewExtensions.includes(ext)) {
      fail(
        `${folder}: preview extension must be one of ${rules.previewExtensions.join(", ")}`
      );
    }
    previewPath = requireFile(
      folder,
      manifest.preview,
      rules.maxPreviewBytes,
      "preview"
    );
  }

  // Validate CSS file
  const cssName = manifest.css ?? "theme.css";
  const cssPath = requireFile(folder, cssName, rules.maxCssBytes, "stylesheet");
  validateCss(readFileSync(cssPath, "utf8"), folder);

  themes.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    license: manifest.license,
    mode: manifest.mode,
    tags: manifest.tags,
    api: manifest.api,
    preview: manifest.preview,
  });
  files.push({ folder, manifestPath, cssPath, cssName, previewPath });
}

if (themes.length > rules.maxThemes)
  fail(`catalog contains more than ${rules.maxThemes} themes`);

// Sort themes by name, then by id for stable ordering
themes.sort((a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
  a.id.localeCompare(b.id)
);

const catalog = `${JSON.stringify({ api: rules.themeApi, themes }, null, 2)}\n`;
if (Buffer.byteLength(catalog, "utf8") > rules.maxCatalogBytes) {
  fail(`generated catalog exceeds the ${rules.maxCatalogBytes} byte limit`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "themes"), { recursive: true });
for (const theme of files) {
  const target = join(output, "themes", theme.folder);
  mkdirSync(target, { recursive: true });
  copyFileSync(theme.manifestPath, join(target, "manifest.json"));
  copyFileSync(theme.cssPath, join(target, theme.cssName));
  if (theme.previewPath)
    copyFileSync(theme.previewPath, join(target, theme.previewPath.split("/").pop()));
}
writeFileSync(join(output, "index.json"), catalog);
console.log(`[community themes] published ${themes.length} theme(s)`);
