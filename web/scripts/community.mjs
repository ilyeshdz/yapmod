/**
 * Builds the community plugin and theme catalogs published with the website.
 *
 * Usage (from the `web/` directory):
 *   node scripts/community.mjs <plugins|themes> [--dev]
 *
 * The generated files are copied into `public/` during development and into
 * `dist/` for a production build.
 */
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;

function failBuilder(kind) {
  return (message) => {
    throw new Error(`[community ${kind}] ${message}`);
  };
}

function readJson(path, fail, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON (${error})`);
  }
}

function createContext(kind, sourceName, webRoot) {
  const source = join(resolve(webRoot, ".."), sourceName);
  const fail = failBuilder(kind);
  const rules = readJson(join(source, "rules.json"), fail, `${sourceName}/rules.json`);

  const requireFile = (folder, name, limit, label) => {
    const path = join(source, folder, name);
    const details = lstatSync(path, { throwIfNoEntry: false });
    if (!details?.isFile() || details.isSymbolicLink()) {
      fail(`${folder}: ${label} file is missing or is not a regular file`);
    }
    if (details.size > limit) {
      fail(`${folder}: ${label} exceeds the ${limit} byte limit`);
    }
    return path;
  };

  const entries = readdirSync(source, { withFileTypes: true })
    .filter(
      (entry) =>
        !entry.name.startsWith(".") &&
        (entry.isDirectory() || entry.isSymbolicLink()),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const validateCommon = (manifest, folder, fields) => {
    if (
      !manifest ||
      typeof manifest !== "object" ||
      Object.keys(manifest).some((key) => !fields.has(key))
    ) {
      fail(`${folder}: manifest contains an unsupported field`);
    }
    if (
      manifest.id !== folder ||
      typeof manifest.name !== "string" ||
      !manifest.name.trim()
    ) {
      fail(`${folder}: manifest id must match the folder and name must be set`);
    }
    manifest.tags ??= [];
    if (
      !Array.isArray(manifest.tags) ||
      manifest.tags.some((tag) => typeof tag !== "string")
    ) {
      fail(`${folder}: tags must be a list of strings`);
    }
  };

  return { source, rules, fail, requireFile, entries, validateCommon };
}

function outputDir(webRoot, dev, folder) {
  return resolve(webRoot, dev ? "public" : "dist", folder);
}

const PLUGIN_FIELDS = new Set([
  "id",
  "name",
  "version",
  "author",
  "description",
  "license",
  "api",
  "tags",
  "settings",
  "stylesheet",
  "script",
]);
const SETTING_FIELDS = new Set([
  "id",
  "label",
  "description",
  "type",
  "default",
  "accept",
]);
const SETTING_TYPES = ["toggle", "text", "file", "color"];
const THEME_FIELDS = new Set([
  "id",
  "name",
  "version",
  "author",
  "description",
  "license",
  "mode",
  "tags",
  "api",
  "css",
]);
const THEME_MODES = ["dark", "light", "both"];

function readManifest(context, folder) {
  const { requireFile, rules, fail } = context;
  const manifestPath = requireFile(
    folder,
    "manifest.json",
    rules.maxManifestBytes,
    "manifest",
  );
  return { manifestPath, manifest: readJson(manifestPath, fail, `${folder}: manifest.json`) };
}

export function buildPlugins({ dev = false, webRoot = process.cwd() } = {}) {
  const context = createContext("plugins", "community-plugins", webRoot);
  const { rules, fail, requireFile, entries, validateCommon } = context;
  const output = outputDir(webRoot, dev, "community-plugins");
  const plugins = [];
  const files = [];

  // Verification is maintained by the repository owners, not plugin authors.
  const verifiedIds = readJson(
    join(context.source, "verified.json"),
    fail,
    "verified.json",
  );
  if (
    !Array.isArray(verifiedIds) ||
    verifiedIds.some((id) => typeof id !== "string" || !VALID_ID.test(id)) ||
    new Set(verifiedIds).size !== verifiedIds.length
  ) {
    fail("verified.json must be a list of unique plugin ids");
  }
  const folderNames = new Set(entries.map((entry) => entry.name));
  for (const id of verifiedIds) {
    if (!folderNames.has(id)) fail(`verified.json lists unknown plugin ${id}`);
  }
  const verified = new Set(verifiedIds);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !VALID_ID.test(entry.name)) {
      fail(`${entry.name}: expected a plugin folder with a valid id`);
    }

    const folder = entry.name;
    const { manifestPath, manifest } = readManifest(context, folder);
    validateCommon(manifest, folder, PLUGIN_FIELDS);

    if (
      !Number.isInteger(manifest.api) ||
      manifest.api < 0 ||
      manifest.api > rules.pluginApi
    ) {
      fail(`${folder}: plugin API must be an integer no newer than ${rules.pluginApi}`);
    }
    manifest.settings ??= [];
    if (!Array.isArray(manifest.settings)) {
      fail(`${folder}: settings must be a list`);
    }

    const settingIds = new Set();
    for (const setting of manifest.settings) {
      if (
        !setting ||
        typeof setting.id !== "string" ||
        !VALID_ID.test(setting.id) ||
        settingIds.has(setting.id) ||
        typeof setting.label !== "string" ||
        !setting.label.trim() ||
        !SETTING_TYPES.includes(setting.type) ||
        Object.keys(setting).some((key) => !SETTING_FIELDS.has(key)) ||
        (setting.description !== undefined &&
          typeof setting.description !== "string") ||
        (setting.accept !== undefined && typeof setting.accept !== "string")
      ) {
        fail(`${folder}: plugin setting is invalid or duplicated`);
      }
      if (setting.type === "toggle") {
        if (typeof setting.default !== "boolean") {
          fail(`${folder}: plugin setting is invalid or duplicated`);
        }
      } else if (setting.default !== null && typeof setting.default !== "string") {
        fail(`${folder}: plugin setting is invalid or duplicated`);
      }
      settingIds.add(setting.id);
    }

    const cssName = manifest.stylesheet ?? "plugin.css";
    if (cssName !== "plugin.css") {
      fail(`${folder}: stylesheet must be named plugin.css`);
    }
    const cssPath = requireFile(folder, cssName, rules.maxCssBytes, "stylesheet");

    const scriptName = manifest.script;
    if (scriptName !== undefined && scriptName !== "plugin.js") {
      fail(`${folder}: script must be named plugin.js`);
    }
    const scriptPath = scriptName
      ? requireFile(folder, scriptName, rules.maxScriptBytes, "script")
      : null;

    plugins.push({
      ...manifest,
      ...(verified.has(folder) ? { verified: true } : {}),
      stylesheet: cssName,
    });
    files.push({ folder, manifestPath, cssPath, scriptPath });
  }

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
    if (plugin.scriptPath) {
      copyFileSync(plugin.scriptPath, join(target, "plugin.js"));
    }
  }
  writeFileSync(join(output, "index.json"), catalog);
  console.log(`[community plugins] published ${plugins.length} plugin(s)`);
}

export function buildThemes({ dev = false, webRoot = process.cwd() } = {}) {
  const context = createContext("themes", "community-themes", webRoot);
  const { rules, fail, requireFile, entries, validateCommon } = context;
  const output = outputDir(webRoot, dev, "community-themes");
  const themes = [];
  const files = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !VALID_ID.test(entry.name)) {
      fail(`${entry.name}: expected a theme folder with a valid id`);
    }

    const folder = entry.name;
    const { manifestPath, manifest } = readManifest(context, folder);
    validateCommon(manifest, folder, THEME_FIELDS);

    if (
      manifest.api !== undefined &&
      (!Number.isInteger(manifest.api) || manifest.api < 0 || manifest.api > rules.themeApi)
    ) {
      fail(`${folder}: theme API must be an integer no newer than ${rules.themeApi}`);
    }
    manifest.mode ??= "both";
    manifest.api ??= 1;
    if (typeof manifest.mode !== "string" || !THEME_MODES.includes(manifest.mode)) {
      fail(`${folder}: mode must be one of ${THEME_MODES.join(", ")}`);
    }

    const cssName = manifest.css ?? "theme.css";
    const cssPath = requireFile(folder, cssName, rules.maxCssBytes, "stylesheet");

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
    });
    files.push({ folder, manifestPath, cssPath, cssName });
  }

  themes.sort(
    (left, right) =>
      left.name.toLowerCase().localeCompare(right.name.toLowerCase()) ||
      left.id.localeCompare(right.id),
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
  }
  writeFileSync(join(output, "index.json"), catalog);
  console.log(`[community themes] published ${themes.length} theme(s)`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  const kind = process.argv[2];
  const dev = process.argv.includes("--dev");
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (kind === "plugins") buildPlugins({ dev, webRoot });
  else if (kind === "themes") buildThemes({ dev, webRoot });
  else {
    console.error("Usage: node scripts/community.mjs <plugins|themes> [--dev]");
    process.exit(1);
  }
}
