import { installModalApi } from "./features/modal/api";
import {
  initializePluginManager,
  installPluginApi,
  installPluginSettings,
} from "./features/plugins/api";
import { installBannerApi } from "./features/banners/api";
import { installSettingsApi } from "./features/settings/api";
import { installStore } from "./core/store";
import { installDefaultSettings } from "./features/settings/defaults";
import { installThemeEngine } from "./features/themes/engine";
import { installThemeSettings } from "./features/themes/settings";
import { installDesktopBridge } from "./core/desktop";
import { installNotificationApi } from "./core/notify";
import { installExternalLinks } from "./core/links";
import { getChangelog } from "./features/settings/release";
import { getScope, getYapmod } from "./core/scope";

const scope = getScope();
const yapmod = getYapmod();
const payload = scope.__YAPMOD__ ?? {};

yapmod.config = payload.config;
yapmod.os = payload.os;
yapmod.internalHost = payload.internalHost;
yapmod.clientVersion = payload.clientVersion;
yapmod.release = payload.release;
yapmod.changelog = getChangelog;

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

// The theme is applied before anything else, so the app never shows the
// wrong colours while it loads.
try {
  installThemeEngine(payload.theme ?? null);
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
  installDesktopBridge();
} catch (error) {
  console.error("[yapmod] failed to install desktop bridge", error);
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
