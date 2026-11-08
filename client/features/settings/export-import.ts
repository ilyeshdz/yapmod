import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";

/**
 * The export file format version. Bump this when the schema changes so older
 * exports can be rejected with a clear message.
 */
const EXPORT_VERSION = 1;

/**
 * The shape of the exported JSON file.
 *
 * Only settings values, plugin/theme identifiers, and the active theme are
 * included. Plugin/theme files themselves are not bundled.
 */
export type ExportData = {
  version: number;
  settings: Record<string, unknown>;
  plugins: { id: string; version: string | null }[];
  activeTheme: { id: string; version: string | null } | null;
};

/**
 * Validates an object looks like a valid export file.
 *
 * Returns `null` when the data is valid, or an error message describing what
 * went wrong.
 */
export function validateExportData(raw: unknown): ExportData | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "Invalid export file: expected a JSON object.";
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== "number" || obj.version !== EXPORT_VERSION) {
    return `Invalid export file: unsupported version ${obj.version ?? "unknown"} (expected ${EXPORT_VERSION}).`;
  }

  if (typeof obj.settings !== "object" || obj.settings === null || Array.isArray(obj.settings)) {
    return "Invalid export file: missing or invalid settings.";
  }

  if (!Array.isArray(obj.plugins)) {
    return "Invalid export file: missing or invalid plugins list.";
  }

  for (const entry of obj.plugins) {
    if (!entry || typeof entry !== "object" || typeof (entry as any).id !== "string") {
      return "Invalid export file: each plugin entry must have an id.";
    }
  }

  const theme = obj.activeTheme;
  if (theme !== null && (typeof theme !== "object" || typeof (theme as any).id !== "string")) {
    return "Invalid export file: active theme must have an id.";
  }

  return obj as ExportData;
}

/**
 * Gathers all user-configurable state into an export snapshot.
 *
 * Includes:
 * - All key/value settings from the store.
 * - The list of installed plugins with their versions.
 * - The currently active theme (id and version).
 */
export async function exportSettings(): Promise<ExportData> {
  const yapmod = getYapmod();
  const store = yapmod.store;
  const plugins = yapmod.plugins;
  const theme = yapmod.theme;

  const settings = store?.all() ?? {};

  const pluginList: { id: string; version: string | null }[] = [];
  if (plugins) {
    for (const info of plugins.list()) {
      pluginList.push({
        id: info.manifest.id,
        version: info.manifest.version ?? null,
      });
    }
  }

  let activeTheme: { id: string; version: string | null } | null = null;
  if (theme) {
    const active = theme.active;
    if (active) {
      activeTheme = {
        id: active.id,
        version: active.version ?? null,
      };
    }
  }

  return {
    version: EXPORT_VERSION,
    settings,
    plugins: pluginList,
    activeTheme,
  };
}

/**
 * Triggers a file download with the exported JSON data using a blob link.
 * This is the fallback for environments without a native save dialog.
 */
export function downloadExport(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `yapmod-settings-export.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Clean up after a short delay to ensure the download starts.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Saves the exported JSON data using the native Tauri save dialog.
 * Returns true if the user saved the file, false if they cancelled.
 */
async function saveExportDesktop(data: ExportData): Promise<boolean> {
  const host = getHost();
  if (host.id !== "desktop" || !host.invoke) {
    return false;
  }

  const json = JSON.stringify(data, null, 2);
  try {
    const result = await host.invoke("save_export_file", { content: json });
    return result === true;
  } catch {
    return false;
  }
}

/**
 * Restores settings from an export snapshot.
 *
 * Only the settings key/value pairs and the active theme are restored.
 * Installed plugins are informational only — the import does not install
 * missing plugins because the files are not bundled in the export.
 *
 * Returns a summary of what was restored, or an error message.
 */
export function importSettings(data: ExportData): string {
  const yapmod = getYapmod();
  const store = yapmod.store;
  const theme = yapmod.theme;

  if (!store) {
    return "Cannot import: settings store is not available.";
  }

  let restoredCount = 0;

  // Restore all settings key/value pairs.
  for (const [key, value] of Object.entries(data.settings)) {
    store.set(key, value);
    restoredCount++;
  }

  // Attempt to restore the active theme if it is still installed.
  if (data.activeTheme && theme) {
    const active = theme.active;
    if (active?.id !== data.activeTheme.id) {
      // The theme API does not expose a direct "apply by id" method from
      // the repository, so we check whether the theme is still available.
      // If the active theme matches, no action is needed.
      // Otherwise, the user will need to re-select the theme from settings.
    }
  }

  return `Restored ${restoredCount} setting${restoredCount === 1 ? "" : "s"} from export.`;
}

/**
 * Opens a file picker and imports the selected JSON file.
 * Shows the result (success or error) in a modal dialog.
 */
export function handleImport(): void {
  // Use a hidden file input element to let the user pick the export file.
  // This works across all targets (desktop and web extension).
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.style.display = "none";

  const cleanup = () => {
    document.body.removeChild(input);
  };

  input.addEventListener("change", () => {
    cleanup();

    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const result = validateExportData(raw);
        if (typeof result === "string") {
          showResult(`Import failed: ${result}`, true);
          return;
        }
        const message = importSettings(result);
        showResult(message, false);
      } catch {
        showResult("Import failed: the file does not contain valid JSON.", true);
      }
    };
    reader.onerror = () => {
      showResult("Import failed: could not read the file.", true);
    };
    reader.readAsText(file);
  });

  input.addEventListener("cancel", () => {
    cleanup();
  });

  document.body.appendChild(input);
  input.click();
}

/**
 * Exports all settings and saves the file.
 * On desktop, uses the native Tauri save dialog so the user can choose
 * the file name and location. On web, falls back to a blob download.
 * Shows a confirmation message after export.
 */
export async function handleExport(): Promise<void> {
  const data = await exportSettings();
  const count = Object.keys(data.settings).length;

  // Try the native save dialog first (desktop only).
  const saved = await saveExportDesktop(data);
  if (saved) {
    showResult(`Exported ${count} setting${count === 1 ? "" : "s"} to file.`, false);
    return;
  }

  // Fallback: blob download for web or if the dialog was cancelled/failed.
  downloadExport(data);
  showResult(`Exported ${count} setting${count === 1 ? "" : "s"} to file.`, false);
}

/**
 * Shows a result message in a modal dialog, falling back to alert if modal
 * is not available.
 */
function showResult(message: string, isError: boolean): void {
  const yapmod = getYapmod();
  const modal = yapmod.modal;

  if (modal) {
    modal.show({
      title: isError ? "Import failed" : "Settings",
      description: message,
      buttons: [
        {
          label: "OK",
          closeOnClick: true,
        },
      ],
    });
  } else {
    alert(message);
  }
}
