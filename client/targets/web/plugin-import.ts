import type { PluginBundle, PluginManifest } from "../../shared/types";
import {
  MAX_MANIFEST_BYTES,
  MAX_PLUGIN_CSS_BYTES,
  MAX_PLUGIN_SCRIPT_BYTES,
} from "./catalog";
import { pickDirectory, pickFile } from "./dialogs";
import {
  normalizePluginManifest,
  samePluginManifest,
  validatePluginBundle,
} from "../../features/plugins/package";
import type { BridgeClient } from "./rpc";

/**
 * The page-realm half of local plugin import.
 *
 * File and folder pickers need the user's activation and stay in the page
 * realm. The resulting bundle is validated here and handed to the isolated
 * bridge, which is the only writer of extension storage.
 */

const MAX_PLUGIN_FILE_BYTES = 8 * 1024 * 1024;
const MANIFEST_FILE = "manifest.json";
const CSS_FILE = "plugin.css";
const SCRIPT_FILE = "plugin.js";

type PickedPlugin = {
  manifest: PluginManifest;
  css: File;
  script: File | null;
};

let pickedPlugin: PickedPlugin | null = null;

async function readTextFile(
  file: File,
  maxBytes: number,
  label: string,
): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`The plugin ${label} is larger than the allowed size.`);
  }

  return file.text();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("The selected file could not be read."));
        return;
      }

      resolve(
        file.type
          ? result
          : result.replace(/^data:[^;,]*/, "data:application/octet-stream"),
      );
    });
    reader.addEventListener("error", () => {
      reject(new Error("The selected file could not be read."));
    });
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a plugin folder selected with the browser's directory picker.
 *
 * The manifest is returned first so the shared client can show its consent
 * dialog. `installPickedPlugin` then reads the two package files it contains.
 */
export async function pickLocalPlugin(): Promise<PluginManifest | null> {
  pickedPlugin = null;

  const directory = await pickDirectory();

  if (!directory) {
    return null;
  }

  const manifestFile = directory.files.get(MANIFEST_FILE);

  if (!manifestFile) {
    throw new Error("The selected folder has no manifest.json.");
  }

  const manifest = normalizePluginManifest(
    JSON.parse(
      await readTextFile(manifestFile, MAX_MANIFEST_BYTES, "manifest"),
    ),
  );
  const cssFile = directory.files.get(manifest.stylesheet ?? CSS_FILE);

  if (!cssFile) {
    throw new Error(`The selected folder has no ${CSS_FILE}.`);
  }

  const scriptFile = manifest.script
    ? (directory.files.get(manifest.script) ?? null)
    : null;

  if (manifest.script && !scriptFile) {
    throw new Error(`The selected folder has no ${SCRIPT_FILE}.`);
  }

  for (const file of [cssFile, scriptFile]) {
    if (file && file.size > MAX_PLUGIN_SCRIPT_BYTES) {
      throw new Error("A plugin file is larger than the allowed size.");
    }
  }

  pickedPlugin = { manifest, css: cssFile, script: scriptFile };

  return manifest;
}

export async function installPickedPlugin(
  bridge: BridgeClient,
  expectedManifest: PluginManifest,
): Promise<PluginBundle> {
  const picked = pickedPlugin;

  pickedPlugin = null;

  if (!picked) {
    throw new Error("Choose a plugin folder before importing it.");
  }

  if (!samePluginManifest(picked.manifest, expectedManifest)) {
    throw new Error("The plugin changed after you reviewed its import warning.");
  }

  const bundle: PluginBundle = {
    manifest: picked.manifest,
    css: await readTextFile(picked.css, MAX_PLUGIN_CSS_BYTES, "stylesheet"),
    script: picked.script
      ? await readTextFile(picked.script, MAX_PLUGIN_SCRIPT_BYTES, "script")
      : null,
    verified: false,
  };

  validatePluginBundle(bundle);

  return bridge.call<PluginBundle>("plugins:storeBundle", bundle);
}

export async function pickPluginFile(
  accept: string | null | undefined,
): Promise<string | null> {
  const file = await pickFile(accept);

  if (!file) {
    return null;
  }

  if (file.size > MAX_PLUGIN_FILE_BYTES) {
    throw new Error("The selected file is larger than 8 MB.");
  }

  return readAsDataUrl(file);
}
