import type { ThemeBundle } from "../../features/themes/types";
import type {
  NotificationOptions,
  NotificationPermission,
  UpdatePort,
  YapmodHost,
} from "../../platform/host";
import { pickPluginFile, pickLocalPlugin, installPickedPlugin } from "./plugin-import";
import { installPickedTheme, pickLocalTheme } from "./theme-import";
import type { BridgeClient, WebBootstrap } from "./rpc";

const INTERNAL_HOST = "yapin.gg";

export type WebHost = {
  host: YapmodHost;
  settings: Record<string, unknown>;
  theme: ThemeBundle | null;
  clientVersion: string;
  shellVersion: string;
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
 * The client runs in the page realm, so plugins and inspectors see the same
 * JavaScript objects as the desktop client. Storage and catalog access are the
 * only privileged operations; they go through the isolated bridge.
 */
export function createWebHost(
  bridge: BridgeClient,
  bootstrap: WebBootstrap,
): WebHost {
  const clickListeners = new Set<(tag: string) => void>();
  const updates: UpdatePort | undefined = bootstrap.runtimeUpdates
    ? {
        async launchStatus() {
          return { trial: false, rolledBack: false };
        },
        async confirmClientUpdate() {
          // The bridge confirms a staged bundle during bootstrap.
        },
        async prepareClientUpdate(currentVersion) {
          return bridge.call("updates:stage", { currentVersion });
        },
        async check() {
          // The extension package has no app release; a store build is updated
          // by the browser and the loader build only updates the client.
          return null;
        },
        async restart() {
          window.location.reload();
        },
      }
    : undefined;

  const host: YapmodHost = {
    id: "web",
    version: bootstrap.clientVersion,
    platform: "web",
    internalHost: INTERNAL_HOST,
    capabilities: {
      windowControls: false,
      notifications: true,
      badge: false,
      packages: "extension-storage",
      updates: bootstrap.runtimeUpdates ? "client" : "extension",
      releaseNotes: false,
      pageRealm: true,
    },

    settings: {
      async save(values) {
        await bridge.call("settings:save", values);
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
        return bridge.call("plugins:list");
      },
      listCommunity() {
        return bridge.call("plugins:listCommunity");
      },
      previewCommunity(id) {
        return bridge.call("plugins:previewCommunity", { id });
      },
      installCommunity(id, expectedManifest) {
        return bridge.call("plugins:installCommunity", { id, expectedManifest });
      },
      pickFolder() {
        return pickLocalPlugin();
      },
      installPicked(expectedManifest) {
        return installPickedPlugin(bridge, expectedManifest);
      },
      pickFile(accept) {
        return pickPluginFile(accept);
      },
      reload(id) {
        return bridge.call("plugins:reload", { id });
      },
      remove(id) {
        return bridge.call("plugins:remove", { id });
      },
      updateCommunity(id) {
        return bridge.call("plugins:updateCommunity", { id });
      },
      async openFolder() {
        // Extension storage has no folder to open.
      },
    },

    themes: {
      list() {
        return bridge.call("themes:list");
      },
      listCommunity() {
        return bridge.call("themes:listCommunity");
      },
      async pickFolder() {
        return pickLocalTheme();
      },
      install(source) {
        return installPickedTheme(bridge, source);
      },
      installCommunity(id) {
        return bridge.call("themes:installCommunity", { id });
      },
      reload(id) {
        return bridge.call("themes:reload", { id });
      },
      remove(id) {
        return bridge.call("themes:remove", { id });
      },
      updateCommunity(id) {
        return bridge.call("themes:updateCommunity", { id });
      },
      async folder() {
        throw new Error("The browser extension has no theme folder.");
      },
      async openFolder() {
        // There is no folder to open.
      },
    },

    updates,
  };

  return {
    host,
    settings: bootstrap.settings,
    theme: bootstrap.theme,
    clientVersion: bootstrap.clientVersion,
    shellVersion: bootstrap.shellVersion,
  };
}
