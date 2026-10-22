import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = "client/generated";
const generatedDir = resolve(root, generated);
const check = process.argv.includes("--check");

/**
 * Keeps the generated bindings identical on every platform.
 *
 * ts-rs can write platform-specific line endings on Windows, and import
 * paths may use backslashes there. Neither should make the check fail.
 */
function normalizeGenerated(dir) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      normalizeGenerated(path);
      continue;
    }

    if (!entry.name.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(path, "utf8");
    const normalized = source
      .replace(/\r\n/g, "\n")
      .replace(/(\bfrom\s+"[^"]*?)\\+/g, "$1/");

    if (normalized !== source) {
      writeFileSync(path, normalized);
    }
  }
}

/**
 * Regenerates the TypeScript bindings of the Rust types.
 *
 * The `ts-rs` export runs as part of the test suite, so the tests are run
 * with the export folder pointed at the injected client source.
 */
const child = spawn(
  "cargo",
  ["test", "--manifest-path", "src-tauri/Cargo.toml"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      TS_RS_EXPORT_DIR: resolve(root, generated),
    },
  },
);

child.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  normalizeGenerated(generatedDir);

  if (!check) {
    process.exit(0);
  }

  const diff = spawnSync(
    "git",
    ["diff", "--quiet", "--ignore-space-at-eol", "--", generated],
    {
      cwd: root,
    },
  );
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", generated],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  if (diff.status !== 0 || untracked.stdout.trim()) {
    const renderedDiff = spawnSync(
      "git",
      ["diff", "--ignore-space-at-eol", "--", generated],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    console.error("The generated types are out of date, run `pnpm types:generate`.");

    if (untracked.stdout.trim()) {
      console.error(`Untracked generated files:\n${untracked.stdout}`);
    }

    if (renderedDiff.stdout.trim()) {
      console.error(renderedDiff.stdout);
    }

    process.exit(1);
  }
});
