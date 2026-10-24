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
const source = join(root, "community-plugins");
const rules = JSON.parse(readFileSync(join(source, "rules.json"), "utf8"));
const outputDir = process.argv.includes("--dev") ? "public" : "dist";
const output = resolve(process.cwd(), `${outputDir}/community-plugins`);
const validId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;
const manifestFields = new Set(["id", "name", "version", "author", "description", "license", "api", "tags", "settings", "stylesheet", "script"]);
const settingFields = new Set(["id", "label", "description", "type", "default"]);

function fail(message) {
  throw new Error(`[community plugins] ${message}`);
}

function requireFile(folder, name, limit, label) {
  if (name !== "plugin.css" && name !== "plugin.js" && name !== "manifest.json") {
    fail(`${folder}: ${label} must use a supported package file name`);
  }
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

  const isIdentCharacter = (character) => character !== undefined && /[a-z0-9_-]/.test(character);
  let index = 0;
  while (index < normalized.length) {
    if (normalized[index] === "@") {
      const start = index + 1;
      let end = start;
      while (isIdentCharacter(normalized[end])) end += 1;
      if (normalized.slice(start, end) === "import") fail(`${folder}: @import is not allowed`);
      index = Math.max(end, index + 1);
      continue;
    }
    if (/[a-z_-]/.test(normalized[index])) {
      const start = index;
      index += 1;
      while (isIdentCharacter(normalized[index])) index += 1;
      const ident = normalized.slice(start, index);
      if (["url", "expression", "image-set", "-webkit-image-set"].includes(ident)) {
        fail(`${folder}: stylesheet contains a blocked external-resource construct`);
      }
      if (ident === "behavior") {
        let next = index;
        while (/\s/.test(normalized[next] ?? "")) next += 1;
        if (normalized[next] === ":") fail(`${folder}: the behavior property is not allowed`);
      }
      continue;
    }
    index += 1;
  }
}

const entries = readdirSync(source, { withFileTypes: true })
  .filter((entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()))
  .sort((left, right) => left.name.localeCompare(right.name));
const plugins = [];
const files = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.isSymbolicLink() || !validId.test(entry.name)) {
    fail(`${entry.name}: expected a plugin folder with a valid id`);
  }
  const folder = entry.name;
  const manifestPath = requireFile(folder, "manifest.json", rules.maxManifestBytes, "manifest");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch (error) { fail(`${folder}: manifest.json is invalid JSON (${error})`); }

  if (!manifest || typeof manifest !== "object" || Object.keys(manifest).some((key) => !manifestFields.has(key))) {
    fail(`${folder}: manifest contains an unsupported field`);
  }

  if (!manifest || manifest.id !== folder || typeof manifest.name !== "string" ||
      !manifest.name.trim() || Array.from(manifest.name).length > rules.maxNameLength) {
    fail(`${folder}: manifest id must match the folder and name must be set`);
  }
  if (!Number.isInteger(manifest.api) || manifest.api < 0 || manifest.api > rules.pluginApi) {
    fail(`${folder}: plugin API must be an integer no newer than ${rules.pluginApi}`);
  }
  manifest.tags ??= [];
  manifest.settings ??= [];
  if (typeof manifest.author === "string" && manifest.author.length > 100) {
    fail(`${folder}: author is too long`);
  }
  if (typeof manifest.description === "string" && manifest.description.length > 500) {
    fail(`${folder}: description is too long`);
  }
  if (typeof manifest.license === "string" && manifest.license.length > 100) {
    fail(`${folder}: license is too long`);
  }
  if (!Array.isArray(manifest.tags) || manifest.tags.length > rules.maxTags ||
      manifest.tags.some((tag) => typeof tag !== "string" || tag.length > 32)) {
    fail(`${folder}: tags must be short strings (at most ${rules.maxTags})`);
  }
  if (!Array.isArray(manifest.settings) || manifest.settings.length > rules.maxSettings) {
    fail(`${folder}: settings must be a list of at most ${rules.maxSettings} entries`);
  }
  const settingIds = new Set();
  for (const setting of manifest.settings) {
    if (!setting || typeof setting.id !== "string" || !validId.test(setting.id) ||
        settingIds.has(setting.id) || typeof setting.label !== "string" ||
        !setting.label.trim() || setting.label.length > 80 || setting.type !== "toggle" ||
        typeof setting.default !== "boolean" ||
        Object.keys(setting).some((key) => !settingFields.has(key)) ||
        (setting.description !== undefined && (typeof setting.description !== "string" || setting.description.length > 200))) {
      fail(`${folder}: plugin setting is invalid or duplicated`);
    }
    settingIds.add(setting.id);
  }
  const cssName = manifest.stylesheet ?? "plugin.css";
  if (cssName !== "plugin.css") fail(`${folder}: stylesheet must be named plugin.css`);
  const cssPath = requireFile(folder, cssName, rules.maxCssBytes, "stylesheet");
  validateCss(readFileSync(cssPath, "utf8"), folder);
  const scriptName = manifest.script;
  if (scriptName !== undefined && scriptName !== "plugin.js") fail(`${folder}: script must be named plugin.js`);
  const scriptPath = scriptName ? requireFile(folder, scriptName, rules.maxScriptBytes, "script") : null;
  plugins.push({ ...manifest, stylesheet: cssName });
  files.push({ folder, manifestPath, cssPath, scriptPath });
}

if (plugins.length > rules.maxPlugins) fail(`catalog contains more than ${rules.maxPlugins} plugins`);
const catalog = `${JSON.stringify({ api: rules.pluginApi, plugins }, null, 2)}\n`;
if (Buffer.byteLength(catalog, "utf8") > rules.maxCatalogBytes) {
  fail(`generated catalog exceeds the ${rules.maxCatalogBytes} byte limit`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "plugins"), { recursive: true });
for (const plugin of files) {
  const target = join(output, "plugins", plugin.folder);
  mkdirSync(target, { recursive: true });
  copyFileSync(plugin.manifestPath, join(target, "manifest.json"));
  copyFileSync(plugin.cssPath, join(target, "plugin.css"));
  if (plugin.scriptPath) copyFileSync(plugin.scriptPath, join(target, "plugin.js"));
}
writeFileSync(join(output, "index.json"), catalog);
console.log(`[community plugins] published ${plugins.length} plugin(s)`);
