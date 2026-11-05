import type { Config } from "../../shared/types";
import { ensureStyle } from "../../shared/ui";
import { installBannerApi } from "../../features/banners/api";
import { installModalApi } from "../../features/modal/api";
import {
  initializePluginManager,
  installPluginApi,
  installPluginSettings,
} from "../../features/plugins/api";
import { installDefaultSettings } from "../../features/settings/defaults";
import { installSettingsApi } from "../../features/settings/api";
import { installThemeApi } from "../../features/themes/api";
import { installThemeSettings } from "../../features/themes/settings";
import { installExternalLinks } from "../../core/links";
import { installHTTPInspector } from "../../core/http";
import { installNotificationApi } from "../../core/notify";
import { getYapmod } from "../../core/scope";
import { installStore } from "../../core/store";
import { installWebSocketInspector } from "../../core/websocket";
import { installHost } from "../../platform/host";
import { createWebHost } from "./host";
import { createBridgeClient, type WebBootstrap } from "./rpc";
import minimumCSS from "../../styles/minimum.css";

const STYLE_ELEMENT_ID = "yapmod-injected-styles";

// The client runs in the page realm. Patch the page's network constructors
// synchronously, before any page script can open a connection.
const bridge = createBridgeClient();

try {
  installWebSocketInspector();
} catch (error) {
  console.error("[yapmod] failed to install WebSocket inspector", error);
}

try {
  installHTTPInspector();
} catch (error) {
  console.error("[yapmod] failed to install HTTP inspector", error);
}

async function start(): Promise<void> {
  const bootstrap = await bridge.call<WebBootstrap>("bootstrap");
  const { host, settings, theme } = createWebHost(bridge, bootstrap);

  installHost(host);

  const yapmod = getYapmod();

  yapmod.config = {
    last_seen_version: null,
    settings: settings as Config["settings"],
  };
  yapmod.internalHost = host.internalHost;
  yapmod.clientVersion = host.version;
  yapmod.release = {
    version: host.version,
    previousVersion: null,
    firstRun: false,
    notes: null,
  };

  ensureStyle(STYLE_ELEMENT_ID, minimumCSS);

  try {
    installModalApi();
  } catch (error) {
    console.error("[yapmod] failed to install modal API", error);
  }

  try {
    installPluginApi();
  } catch (error) {
    console.error("[yapmod] failed to install plugin API", error);
  }

  try {
    installBannerApi();
  } catch (error) {
    console.error("[yapmod] failed to install banner API", error);
  }

  try {
    installStore();
  } catch (error) {
    console.error("[yapmod] failed to install store", error);
  }

  try {
    installSettingsApi();
  } catch (error) {
    console.error("[yapmod] failed to install settings API", error);
  }

  try {
    initializePluginManager();
  } catch (error) {
    console.error("[yapmod] failed to initialize plugins", error);
  }

  try {
    installPluginSettings();
  } catch (error) {
    console.error("[yapmod] failed to install plugin settings", error);
  }

  try {
    installThemeApi(theme);
  } catch (error) {
    console.error("[yapmod] failed to install theme engine", error);
  }

  try {
    installDefaultSettings();
  } catch (error) {
    console.error("[yapmod] failed to install default settings", error);
  }

  try {
    installThemeSettings();
  } catch (error) {
    console.error("[yapmod] failed to install theme settings", error);
  }

  try {
    installNotificationApi();
  } catch (error) {
    console.error("[yapmod] failed to install notification API", error);
  }

  try {
    installExternalLinks();
  } catch (error) {
    console.error("[yapmod] failed to install external links", error);
  }
}

void start().catch((error: unknown) => {
  console.error("[yapmod] failed to start the web client", error);
});
