import type { Config } from "../../shared/types";
import { ensureStyle } from "../../shared/ui";
import { installBannerApi } from "../../features/banners/api";
import { installModalApi } from "../../features/modal/api";
import { installDefaultSettings } from "../../features/settings/defaults";
import { installSettingsApi } from "../../features/settings/api";
import { installThemeEngine } from "../../features/themes/engine";
import { installThemeSettings } from "../../features/themes/settings";
import { installExternalLinks } from "../../core/links";
import { installNotificationApi } from "../../core/notify";
import { getYapmod } from "../../core/scope";
import { installStore } from "../../core/store";
import { installHost } from "../../platform/host";
import { createWebHost } from "./host";
import minimumCSS from "../../styles/minimum.css";

const STYLE_ELEMENT_ID = "yapmod-injected-styles";

async function start(): Promise<void> {
  const { host, settings, theme } = await createWebHost();

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
    installThemeEngine(theme);
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
