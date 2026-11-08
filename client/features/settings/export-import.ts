import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";
import { isRecord } from "../../shared/helpers";

const EXPORT_VERSION = 1;

export type ExportData = {
  version: number;
  settings: Record<string, unknown>;
  plugins: { id: string; version: string | null }[];
  activeTheme: { id: string; version: string | null } | null;
};

export function validateExportData(raw: unknown): ExportData | string {
  if (!isRecord(raw)) {
    return "Invalid export file: expected a JSON object.";
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== "number" || obj.version !== EXPORT_VERSION) {
    return `Invalid export file: unsupported version ${obj.version ?? "unknown"} (expected ${EXPORT_VERSION}).`;
  }

  if (!isRecord(obj.settings)) {
    return "Invalid export file: missing or invalid settings.";
  }

  if (!Array.isArray(obj.plugins)) {
    return "Invalid export file: missing or invalid plugins list.";
  }

  for (const entry of obj.plugins) {
    if (!isRecord(entry) || typeof (entry as any).id !== "string") {
      return "Invalid export file: each plugin entry must have an id.";
    }
  }

  const theme = obj.activeTheme;
  if (theme !== null && (!isRecord(theme) || typeof (theme as any).id !== "string")) {
    return "Invalid export file: active theme must have an id.";
  }

  return obj as ExportData;
}

export async function exportSettings(): Promise<ExportData> {
  const yapmod = getYapmod();
  const settings = yapmod.store?.all() ?? {};

  const plugins = yapmod.plugins?.list().map((info) => ({
    id: info.manifest.id,
    version: info.manifest.version ?? null,
  })) ?? [];

  const active = yapmod.theme?.active;
  const activeTheme = active
    ? { id: active.id, version: active.version ?? null }
    : null;

  return { version: EXPORT_VERSION, settings, plugins, activeTheme };
}

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

export function importSettings(data: ExportData): string {
  const store = getYapmod().store;
  if (!store) {
    return "Cannot import: settings store is not available.";
  }

  for (const [key, value] of Object.entries(data.settings)) {
    store.set(key, value);
  }

  const count = Object.keys(data.settings).length;
  return `Restored ${count} setting${count === 1 ? "" : "s"} from export.`;
}

export function handleImport(): void {
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

export async function handleExport(): Promise<void> {
  const data = await exportSettings();
  const count = Object.keys(data.settings).length;
  const message = `Exported ${count} setting${count === 1 ? "" : "s"} to file.`;

  // Try the native save dialog first (desktop only).
  const saved = await saveExportDesktop(data);
  if (saved) {
    showResult(message, false);
    return;
  }

  // Fallback: blob download for web extension target.
  downloadExport(data);
  showResult(message, false);
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
