import { invokeCommand } from "../../core/tauri";
import type { Payload } from "../../shared/types";
import type {
  YapmodHost,
  NotificationPermission,
  NotificationOptions,
} from "../../platform/host";

const NOTIFICATION_CLICK_EVENT = "yapmod:notification-click";

/**
 * The host services provided by the Tauri shell.
 *
 * Every method maps to the Tauri command the desktop client already used, so
 * this adapter is the only place in the client that knows command names.
 */
export function createDesktopHost(payload: Partial<Payload>): YapmodHost {
  return {
    id: "desktop",
    version: payload.clientVersion ?? "embedded",
    platform: payload.os ?? "",
    internalHost: payload.internalHost ?? "yapin.gg",
    capabilities: {
      windowControls: true,
      notifications: true,
      badge: true,
      packages: "filesystem",
      updates: "app-and-client",
      releaseNotes: true,
      pageRealm: true,
    },

    settings: {
      save(values) {
        return invokeCommand<void>("set_settings", { values });
      },
    },

    links: {
      open(url) {
        return invokeCommand<void>("plugin:opener|open_url", { url });
      },
    },

    notifications: {
      request(): Promise<NotificationPermission> {
        return invokeCommand<string>("request_notification_permission")
          .then(() => "granted" as const);
      },
      show(title: string, options: NotificationOptions) {
        return invokeCommand<void>("notify", {
          title,
          body: options.body ?? "",
          tag: options.tag ?? title,
          silent: options.silent ?? false,
        });
      },
      onClick(listener) {
        const handler = (event: Event): void => {
          listener((event as CustomEvent<string>).detail);
        };

        window.addEventListener(NOTIFICATION_CLICK_EVENT, handler);

        return () => {
          window.removeEventListener(NOTIFICATION_CLICK_EVENT, handler);
        };
      },
    },

    window: {
      minimize: () => invokeCommand<void>("minimize_main_window"),
      toggleMaximize: () => invokeCommand<void>("toggle_main_window_maximize"),
      close: () => invokeCommand<void>("close_main_window"),
    },

    badge: {
      set(count) {
        return invokeCommand<void>("set_badge_count", {
          count: typeof count === "number" && Number.isFinite(count) ? count : null,
        });
      },
    },

    themes: {
      list: () => invokeCommand("list_themes"),
      listCommunity: () => invokeCommand("list_community_themes"),
      pickFolder: () => invokeCommand("pick_theme_folder"),
      install: (source) => invokeCommand("install_theme", { source }),
      installCommunity: (id) => invokeCommand("install_community_theme", { id }),
      remove: (id) => invokeCommand("remove_theme", { id }),
      folder: () => invokeCommand("themes_folder"),
      openFolder: () => invokeCommand("open_themes_folder"),
    },

    plugins: {
      list: () => invokeCommand("list_plugins"),
      listCommunity: () => invokeCommand("list_community_plugins"),
      previewCommunity: (id) => invokeCommand("preview_community_plugin", { id }),
      installCommunity: (id, expectedManifest) =>
        invokeCommand("install_community_plugin", { id, expectedManifest }),
      pickFolder: () => invokeCommand("pick_plugin_folder"),
      installPicked: (expectedManifest) =>
        invokeCommand("install_picked_plugin", { expectedManifest }),
      pickFile: (accept) => invokeCommand("pick_plugin_file", { accept }),
      remove: (id) => invokeCommand("remove_plugin", { id }),
      openFolder: () => invokeCommand("open_plugins_folder"),
    },

    updates: {
      launchStatus: () => invokeCommand("get_client_update_launch_status"),
      confirmClientUpdate: () => invokeCommand("confirm_client_update"),
      prepareClientUpdate: (currentClientVersion) =>
        invokeCommand("prepare_client_update", { currentClientVersion }),
      check: () => invokeCommand("check_for_update"),
      restart: () => invokeCommand("restart_app"),
    },

    release: {
      changelog: () => invokeCommand("get_changelog"),
    },

    invoke(command, args) {
      return invokeCommand(command, args);
    },
  };
}
