/**
 * Generates the source-derived parts of the developer documentation.
 *
 * The reference pages explain the API by hand; the signatures, manifest
 * fields, theme tokens and size limits in `src/data/*.json` come from the
 * implementation so they cannot drift silently.
 *
 * Run with `pnpm docs:generate` from `web/`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const webRoot = process.cwd();
const repoRoot = resolve(webRoot, "..");
const dataDir = join(webRoot, "src/data");

const sources = {
  shared: join(repoRoot, "client/shared/types.ts"),
  banners: join(repoRoot, "client/features/banners/api.tsx"),
  generated: join(repoRoot, "client/generated/types.ts"),
  tokens: join(repoRoot, "client/features/themes/tokens.ts"),
  pluginRules: join(repoRoot, "community-plugins/rules.json"),
  themeRules: join(repoRoot, "community-themes/rules.json"),
};

const pluginTypeNames = [
  "YapmodPluginApi",
  "YapmodPluginModule",
  "PluginActivation",
  "PluginCleanup",
  "PluginManifest",
  "PluginSetting",
  "PluginSettingValue",
  "PluginDiagnostic",
  "YapmodPluginInfo",
  "YapmodPluginLogger",
  "YapmodPluginStorageApi",
  "YapmodPluginSettingsApi",
  "PluginSettingsPanel",
  "SettingsContext",
  "SettingsItem",
  "YapmodPluginNotifyApi",
  "PluginNotifyOptions",
  "HTTPInspector",
  "HTTPMessage",
  "HTTPOutgoingMessage",
  "HTTPOutgoingRequestPatch",
  "HTTPOutgoingInterceptor",
  "HTTPResponseInterceptor",
  "HTTPMessageHandler",
  "HTTPOutgoingMessageHandler",
  "WebSocketInspector",
  "WebSocketMessage",
  "WebSocketMessageHandler",
  "BlobSnapshot",
  "WebSocketOutgoingInterceptor",
  "WebSocketIncomingInterceptor",
  "YapmodModalApi",
  "YapmodModal",
  "ModalOptions",
  "ModalButton",
  "ModalContent",
  "ModalCloseReason",
  "ModalSize",
  "YapmodBannerApi",
  "YapmodBanner",
  "BannerOptions",
  "BannerTone",
];

const themeTypeNames = ["ThemeManifest", "ThemeBundle", "ThemeMode"];

function parse(file) {
  const text = readFileSync(file, "utf8");
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function docComment(node) {
  const docs = node.jsDoc ?? [];
  const text = docs
    .map((doc) => ts.getTextOfJSDocComment(doc.comment))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function memberName(member) {
  const name = member.name?.getText();
  if (!name) return null;
  return name.replace(/^["']|["']$/g, "");
}

function cleanType(text) {
  return text
    .replace(/\s*\/\*\*[\s\S]*?\*\/\s*/g, " ")
    .replace(/\s*\/\/[^\n]*/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function memberType(member) {
  if (ts.isMethodSignature(member)) {
    const parameters = member.parameters.map((parameter) => parameter.getText()).join(", ");
    const result = member.type ? member.type.getText() : "void";
    return cleanType(`(${parameters}) => ${result}`);
  }
  if (member.type) return cleanType(member.type.getText());
  return "unknown";
}

function membersOf(node) {
  const type = node.type;
  if (!type) return [];

  const literals = ts.isTypeLiteralNode(type)
    ? [type]
    : ts.isIntersectionTypeNode(type)
      ? type.types.filter(ts.isTypeLiteralNode)
      : [];

  return literals.flatMap((literal) =>
    literal.members
      .map((member) => {
        const name = memberName(member);
        if (!name) return null;

        return {
          name,
          type: memberType(member),
          optional: Boolean(member.questionToken),
          readonly: Boolean(member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)),
          description: docComment(member),
        };
      })
      .filter(Boolean),
  );
}

function collectDeclarations(file, wanted) {
  const source = parse(file);
  const found = new Map();

  for (const statement of source.statements) {
    const name = statement.name?.text;
    if (!name || !wanted.includes(name)) continue;

    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isFunctionDeclaration(statement)
    ) {
      found.set(name, {
        name,
        kind: ts.isInterfaceDeclaration(statement)
          ? "interface"
          : ts.isFunctionDeclaration(statement)
            ? "function"
            : "type",
        description: docComment(statement),
        declaration: cleanType(statement.getText(source)),
        members: membersOf(statement),
      });
    }
  }

  return found;
}

function collectTypes() {
  const declarations = new Map();

  for (const [file, names] of [
    [sources.shared, pluginTypeNames],
    [sources.banners, pluginTypeNames],
    [sources.generated, themeTypeNames],
  ]) {
    for (const [name, declaration] of collectDeclarations(file, names)) {
      declarations.set(name, declaration);
    }
  }

  return declarations;
}

function tokenDefinitions() {
  const source = parse(sources.tokens);
  const tokens = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (node.name.getText() === "COLOR_TOKENS" || node.name.getText() === "OWN_TOKENS") &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;

        const values = {};
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText();
          const initializer = property.initializer;
          values[key] = ts.isStringLiteral(initializer)
            ? initializer.text
            : initializer.getText();
        }

        if (values.name) {
          tokens.push({
            name: values.name,
            variable: values.variable === "null" ? null : values.variable ?? null,
            dark: values.dark,
            light: values.light,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return tokens;
}

function hash(files) {
  const digest = createHash("sha256");
  for (const file of files) digest.update(readFileSync(file));
  return digest.digest("hex").slice(0, 16);
}

const declarations = collectTypes();
const missing = [...pluginTypeNames, ...themeTypeNames].filter(
  (name) => !declarations.has(name),
);
if (missing.length > 0) {
  throw new Error(`Documentation generator could not find: ${missing.join(", ")}`);
}

const pluginApi = {
  generatedFrom: ["client/shared/types.ts", "client/features/banners/api.tsx"],
  sourceHash: hash([sources.shared, sources.banners]),
  types: Object.fromEntries(
    pluginTypeNames.map((name) => [name, declarations.get(name)]),
  ),
};

const themeReference = {
  generatedFrom: [
    "client/generated/types.ts",
    "client/features/themes/tokens.ts",
    "community-themes/rules.json",
  ],
  sourceHash: hash([sources.generated, sources.tokens, sources.themeRules]),
  types: Object.fromEntries(
    themeTypeNames.map((name) => [name, declarations.get(name)]),
  ),
  tokens: tokenDefinitions(),
  rules: JSON.parse(readFileSync(sources.themeRules, "utf8")),
};

const pluginReference = {
  generatedFrom: ["community-plugins/rules.json", "client/shared/types.ts"],
  sourceHash: hash([sources.pluginRules, sources.shared]),
  rules: JSON.parse(readFileSync(sources.pluginRules, "utf8")),
  types: {
    PluginManifest: declarations.get("PluginManifest"),
    PluginSetting: declarations.get("PluginSetting"),
  },
};

const outputs = {
  "plugin-api.json": `${JSON.stringify(pluginApi, null, 2)}\n`,
  "plugin-reference.json": `${JSON.stringify(pluginReference, null, 2)}\n`,
  "theme-reference.json": `${JSON.stringify(themeReference, null, 2)}\n`,
};

const check = process.argv.includes("--check");
let stale = false;

for (const [name, contents] of Object.entries(outputs)) {
  const path = join(dataDir, name);

  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      // A missing file is stale as well.
    }

    if (current !== contents) {
      console.error(`[docs] ${name} is out of date; run \`pnpm docs:generate\``);
      stale = true;
    }
  } else {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path, contents);
  }
}

if (stale) process.exit(1);

console.log(
  check
    ? "[docs] generated documentation data is up to date"
    : `[docs] generated ${pluginTypeNames.length} plugin types, ` +
        `${themeReference.tokens.length} theme tokens, and the manifest limits`,
);
