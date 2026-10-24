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
const outputDir = process.argv.includes("--dev") ? "public" : "dist";
const output = resolve(process.cwd(), `${outputDir}/community-themes`);
const themeApi = 1;
const maxCssBytes = 1024 * 1024;
const maxPreviewBytes = 4 * 1024 * 1024;
const validId = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const validFile = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const previewExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

function fail(message) {
  throw new Error(`[community themes] ${message}`);
}

function requireFile(folder, name, limit, label) {
  if (typeof name !== "string" || !validFile.test(name) || name.includes("..")) {
    fail(`${folder}: ${label} must be a simple file name`);
  }

  const path = join(source, folder, name);
  const details = lstatSync(path, { throwIfNoEntry: false });

  if (!details?.isFile() || details.isSymbolicLink()) {
    fail(`${folder}: ${label} file ${name} is missing or is not a regular file`);
  }

  if (details.size > limit) {
    fail(`${folder}: ${label} exceeds the ${limit} byte limit`);
  }

  return path;
}

const entries = readdirSync(source, { withFileTypes: true })
  .filter((entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()))
  .sort((left, right) => left.name.localeCompare(right.name));
const themes = [];
const files = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.isSymbolicLink() || !validId.test(entry.name)) {
    fail(`${entry.name}: expected a theme folder with a valid id`);
  }

  const folder = entry.name;
  const manifestPath = requireFile(folder, "manifest.json", 64 * 1024, "manifest");
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`${folder}: manifest.json is not valid JSON (${error})`);
  }

  if (!manifest || manifest.id !== folder || typeof manifest.name !== "string" || !manifest.name.trim() || manifest.name.length > 120) {
    fail(`${folder}: manifest id must match the folder and name must be set`);
  }

  if (manifest.api != null && (!Number.isInteger(manifest.api) || manifest.api < 0 || manifest.api > themeApi)) {
    fail(`${folder}: theme API must be an integer no newer than ${themeApi}`);
  }

  const cssName = manifest.css ?? "theme.css";
  const previewName = manifest.preview;
  const cssPath = requireFile(folder, cssName, maxCssBytes, "stylesheet");

  if (typeof previewName !== "string" || !previewExtensions.has(previewName.split(".").at(-1)?.toLowerCase())) {
    fail(`${folder}: a PNG, JPEG, WebP, GIF or SVG preview is required`);
  }

  const previewPath = requireFile(folder, previewName, maxPreviewBytes, "preview");
  const mode = ["dark", "light", "both"].includes(manifest.mode) ? manifest.mode : "dark";
  const tags = Array.isArray(manifest.tags)
    ? manifest.tags.filter((tag) => typeof tag === "string").slice(0, 20)
    : [];

  themes.push({
    id: folder,
    name: manifest.name.trim(),
    version: typeof manifest.version === "string" ? manifest.version : null,
    author: typeof manifest.author === "string" ? manifest.author : null,
    description: typeof manifest.description === "string" ? manifest.description : null,
    license: typeof manifest.license === "string" ? manifest.license : null,
    mode,
    tags,
    api: manifest.api ?? themeApi,
    preview: previewName,
  });

  files.push({ folder, manifestPath, cssPath, cssName, previewPath, previewName });
}

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "themes"), { recursive: true });

for (const filesForTheme of files) {
  const themeOutput = join(output, "themes", filesForTheme.folder);
  mkdirSync(themeOutput, { recursive: true });
  copyFileSync(filesForTheme.manifestPath, join(themeOutput, "manifest.json"));
  copyFileSync(filesForTheme.previewPath, join(themeOutput, filesForTheme.previewName));
  copyFileSync(filesForTheme.cssPath, join(themeOutput, filesForTheme.cssName));
}

writeFileSync(
  join(output, "index.json"),
  `${JSON.stringify({ api: themeApi, themes }, null, 2)}\n`,
);

console.log(`[community themes] published ${themes.length} theme(s)`);
