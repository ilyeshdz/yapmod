/**
 * The small slice of the WebExtension API the web target needs.
 *
 * The types are declared here instead of pulling in `@types/chrome`, so the
 * client keeps building without a browser-specific dependency. Chrome exposes
 * promise-based storage in MV3; Firefox exposes the same shape as `browser`.
 */

type StorageArea = {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

type ExtensionRuntime = {
  getManifest(): { version?: string };
  sendMessage?(message: unknown): Promise<unknown>;
  onMessage?: {
    addListener(listener: RuntimeMessageListener): void;
  };
};

export type ExtensionApi = {
  storage?: { local?: StorageArea };
  runtime?: ExtensionRuntime;
};

type ExtensionGlobal = typeof globalThis & {
  chrome?: ExtensionApi;
  browser?: ExtensionApi;
};

/** The extension API of the current realm, if this is an extension. */
export function extensionApi(): ExtensionApi | null {
  const scope = globalThis as ExtensionGlobal;

  return scope.browser ?? scope.chrome ?? null;
}

/** The extension runtime, when the target runs inside an extension. */
export function extensionRuntime(): ExtensionRuntime | null {
  return extensionApi()?.runtime ?? null;
}

/** The version of the extension package, as the browser sees it. */
export function extensionVersion(): string {
  return extensionRuntime()?.getManifest().version ?? "web";
}

/** The extension storage area, when the target runs inside an extension. */
export function storageArea(): StorageArea {
  const area = extensionApi()?.storage?.local;

  if (!area) {
    throw new Error("[yapmod] extension storage is not available");
  }

  return area;
}

/**
 * Asks the background worker for something.
 *
 * Returns `null` when there is no runtime to talk to, so the caller can fall
 * back to a direct request outside the extension.
 */
export async function sendRuntimeMessage<T>(
  message: unknown,
): Promise<T | null> {
  const runtime = extensionRuntime();

  if (!runtime?.sendMessage) {
    return null;
  }

  return (await runtime.sendMessage(message)) as T;
}
