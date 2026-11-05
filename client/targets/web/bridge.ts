import type {
  PluginBundle,
  PluginManifest,
} from "../../shared/types";
import type { ThemeBundle } from "../../features/themes/types";
import type { FetchResponse } from "./catalog";
import { FETCH_MESSAGE } from "./catalog";
import { sendRuntimeMessage } from "./extension";
import {
  BRIDGE_CONNECT,
  type BridgeRequest,
  type BridgeResponse,
  type WebBootstrap,
} from "./rpc";
import { extensionVersion } from "./extension";
import { CLIENT_VERSION } from "./version";
import {
  installCommunityPlugin,
  listCommunityPlugins,
  listInstalledPlugins,
  previewCommunityPlugin,
  removePlugin,
  storeImportedPlugin,
} from "./plugins";
import {
  installCommunityTheme,
  listCommunityThemes,
  removeTheme,
  storeImportedTheme,
} from "./themes";
import {
  readStoredSettings,
  readStoredThemes,
  saveStoredSettings,
} from "./storage";
import { confirmCachedBundle, readCachedBundle, writeCachedBundle } from "./update-cache";
import {
  isNewer,
  isUpdateUrl,
  MAX_BUNDLE_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_SIGNATURE_BYTES,
  parseAndVerifyManifest,
  runtimeUpdatesAvailable,
  updateUrl,
  verifyBundle,
  type ClientUpdateCheck,
} from "./update-feed";

/**
 * The isolated half of the web target.
 *
 * Only this script can use extension storage and the background worker. The
 * page realm owns the client and plugin execution; privileged operations
 * arrive over a private MessageChannel.
 */

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("the bridge received invalid parameters");
  }

  return value as Record<string, unknown>;
}

function stringField(params: Record<string, unknown>, field: string): string {
  const value = params[field];

  if (typeof value !== "string") {
    throw new Error(`the bridge expected a string ${field}`);
  }

  return value;
}

/** Reads one file from this channel's signed web feed. */
async function fetchFeedText(file: string, maxBytes: number): Promise<string> {
  const url = updateUrl(file);

  if (!isUpdateUrl(url)) {
    throw new Error("the client update URL is invalid");
  }

  const response = await sendRuntimeMessage<FetchResponse>({
    type: FETCH_MESSAGE,
    url,
    maxBytes,
  });

  if (!response) {
    throw new Error("the background worker is not available");
  }
  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.text;
}

async function checkForClientUpdate(
  currentVersion: string,
): Promise<ClientUpdateCheck | null> {
  if (!runtimeUpdatesAvailable()) {
    return null;
  }

  const manifest = await parseAndVerifyManifest(
    await fetchFeedText("manifest.json", MAX_MANIFEST_BYTES),
    (await fetchFeedText("manifest.sig", MAX_SIGNATURE_BYTES)).trim(),
    extensionVersion(),
  );

  if (!isNewer(manifest.clientVersion, currentVersion)) {
    return null;
  }

  return {
    currentVersion,
    latestVersion: manifest.clientVersion,
  };
}

async function bootstrap(params?: unknown): Promise<WebBootstrap> {
  const input =
    typeof params === "object" && params !== null
      ? (params as Record<string, unknown>)
      : {};
  const pageVersion =
    typeof input.clientVersion === "string" &&
    /^\d+\.\d+\.\d+/.test(input.clientVersion)
      ? input.clientVersion
      : CLIENT_VERSION;
  const settings = await readStoredSettings();
  const themes = await readStoredThemes();
  const selectedId =
    typeof settings.theme_id === "string" ? settings.theme_id : "";

  // Reaching this point means the client code the loader started actually
  // booted, so a staged bundle is safe to keep.
  if (runtimeUpdatesAvailable()) {
    confirmCachedBundle(pageVersion);
  }

  return {
    clientVersion: pageVersion,
    shellVersion: extensionVersion(),
    runtimeUpdates: runtimeUpdatesAvailable(),
    settings,
    theme: themes.find((theme) => theme.id === selectedId) ?? null,
  };
}

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
  bootstrap,

  "settings:save": async (params) => {
    const values = record(params);

    await saveStoredSettings(values);

    return null;
  },

  "themes:list": () => readStoredThemes(),
  "themes:listCommunity": () => listCommunityThemes(),
  "themes:installCommunity": (params) =>
    installCommunityTheme(stringField(record(params), "id")),
  "themes:storeBundle": (params) =>
    storeImportedTheme(params as ThemeBundle),
  "themes:remove": async (params) => {
    await removeTheme(stringField(record(params), "id"));

    return null;
  },

  "plugins:list": () => listInstalledPlugins(),
  "plugins:listCommunity": () => listCommunityPlugins(),
  "plugins:previewCommunity": (params) =>
    previewCommunityPlugin(stringField(record(params), "id")),
  "plugins:installCommunity": (params) => {
    const input = record(params);

    return installCommunityPlugin(
      stringField(input, "id"),
      input.expectedManifest as PluginManifest,
    );
  },
  "plugins:storeBundle": (params) =>
    storeImportedPlugin(params as PluginBundle),
  "plugins:remove": async (params) => {
    await removePlugin(stringField(record(params), "id"));

    return null;
  },

  "updates:check": (params) =>
    checkForClientUpdate(
      stringField(record(params), "currentVersion"),
    ),

  "updates:stage": async (params) => {
    const currentVersion = stringField(record(params), "currentVersion");

    if (!runtimeUpdatesAvailable()) {
      throw new Error("this extension cannot stage client updates");
    }

    const manifest = await parseAndVerifyManifest(
      await fetchFeedText("manifest.json", MAX_MANIFEST_BYTES),
      (await fetchFeedText("manifest.sig", MAX_SIGNATURE_BYTES)).trim(),
      extensionVersion(),
    );
    const cached = readCachedBundle();

    if (
      !isNewer(manifest.clientVersion, currentVersion) ||
      (cached && cached.releaseSequence >= manifest.releaseSequence)
    ) {
      return null;
    }

    const bundle = await verifyBundle(
      await fetchFeedText("bundle.json", MAX_BUNDLE_BYTES),
      manifest,
    );

    writeCachedBundle({
      clientVersion: manifest.clientVersion,
      releaseSequence: manifest.releaseSequence,
      expiresAt: manifest.expiresAt,
      preinject: bundle.preinject,
      confirmed: false,
      attempts: 0,
    });

    return {
      currentVersion,
      latestVersion: manifest.clientVersion,
    };
  },
};

async function dispatch(request: BridgeRequest): Promise<BridgeResponse> {
  const handler = handlers[request.method];

  if (!handler) {
    return {
      id: request.id,
      ok: false,
      error: `the bridge has no method ${request.method}`,
    };
  }

  try {
    return { id: request.id, ok: true, result: await handler(request.params) };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

let connected = false;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (connected) {
    return;
  }

  const message = event.data as { type?: unknown } | null;

  if (
    event.source !== window ||
    message?.type !== BRIDGE_CONNECT ||
    event.ports.length === 0
  ) {
    return;
  }

  connected = true;

  const port = event.ports[0];

  port.onmessage = (messageEvent: MessageEvent<BridgeRequest>) => {
    void dispatch(messageEvent.data).then((response) => {
      port.postMessage(response);
    });
  };
  port.start();
});
