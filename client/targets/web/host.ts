import type { ThemeBundle } from "../../features/themes/types";
import type {
  NotificationOptions,
  NotificationPermission,
  YapmodHost,
} from "../../platform/host";
import { extensionVersion } from "./extension";
import { readStoredSettings, saveStoredSettings, readStoredThemes } from "./storage";
import {
  installCommunityPlugin,
  installPickedPlugin,
  listCommunityPlugins,
  listInstalledPlugins,
  pickLocalPlugin,
  pickPluginFile,
  previewCommunityPlugin,
  removePlugin,
} from "./plugins";
import {
  installCommunityTheme,
  listCommunityThemes,
  removeTheme,
} from "./themes";

const INTERNAL_HOST = "yapin.gg";

export type WebHost = {
  host: YapmodHost;
  settings: Record<string, unknown>;
  theme: ThemeBundle | null;
};

function notificationPermission(): NotificationPermission {
  if (!("Notification" in window)) {
    return "denied";
  }

  return window.Notification.permission;
}

/**
 * The host services of the browser extension.
 *
 * The extension runs in an isolated world: it can change the page DOM, but it
 * cannot replace the page's JavaScript objects. Plugin scripts therefore run
 * in the extension world, without page-realm hooks or host commands. Window
 * controls, badges and remote client updates are still desktop-only.
 */
export async function createWebHost(): Promise<WebHost> {
  const settings = await readStoredSettings();
  const version = extensionVersion();
  const clickListeners = new Set<(tag: string) => void>();

  const themes = await readStoredThemes();
  const selectedId =
    typeof settings.theme_id === "string" ? settings.theme_id : "";
  const theme = themes.find((candidate) => candidate.id === selectedId) ?? null;

  const host: YapmodHost = {
    id: "web",
    version,
    platform: "web",
    internalHost: INTERNAL_HOST,
    capabilities: {
      windowControls: false,
      notifications: true,
      badge: false,
      packages: "extension-storage",
      updates: "extension",
      releaseNotes: false,
      pageRealm: false,
    },

    settings: {
      save(values) {
        return saveStoredSettings(values);
      },
    },

    links: {
      async open(url) {
        const opened = window.open(url, "_blank", "noopener,noreferrer");

        if (opened) {
          return;
        }

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      },
    },

    notifications: {
      async request() {
        if (!("Notification" in window)) {
          return "denied";
        }

        const current = notificationPermission();

        if (current !== "default") {
          return current;
        }

        try {
          return await window.Notification.requestPermission();
        } catch {
          return "denied";
        }
      },

      async show(title: string, options: NotificationOptions) {
        if (notificationPermission() !== "granted") {
          return;
        }

        const tag = options.tag ?? title;
        const notification = new window.Notification(title, {
          body: options.body,
          tag,
          silent: options.silent,
        });

        notification.onclick = () => {
          for (const listener of [...clickListeners]) {
            try {
              listener(tag);
            } catch (error) {
              console.error("[yapmod] notification click handler failed", error);
            }
          }

          notification.close();
        };
      },

      onClick(listener) {
        clickListeners.add(listener);

        return () => {
          clickListeners.delete(listener);
        };
      },
    },

    plugins: {
      list() {
        return listInstalledPlugins();
      },
      listCommunity() {
        return listCommunityPlugins();
      },
      previewCommunity(id) {
        return previewCommunityPlugin(id);
      },
      installCommunity(id, expectedManifest) {
        return installCommunityPlugin(id, expectedManifest);
      },
      pickFolder() {
        return pickLocalPlugin();
      },
      installPicked(expectedManifest) {
        return installPickedPlugin(expectedManifest);
      },
      pickFile(accept) {
        return pickPluginFile(accept);
      },
      remove(id) {
        return removePlugin(id);
      },
      async openFolder() {
        // Extension storage has no folder to open.
      },
    },

    themes: {
      list() {
        return readStoredThemes();
      },
      listCommunity() {
        return listCommunityThemes();
      },
      async pickFolder() {
        return null;
      },
      async install() {
        throw new Error(
          "The browser extension installs themes from the community catalog.",
        );
      },
      installCommunity(id) {
        return installCommunityTheme(id);
      },
      remove(id) {
        return removeTheme(id);
      },
      async folder() {
        throw new Error("The browser extension has no theme folder.");
      },
      async openFolder() {
        // There is no folder to open.
      },
    },
  };

  return { host, settings, theme };
}
