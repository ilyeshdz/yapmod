import { render } from "solid-js/web";

import type {
  ReleaseEntry,
  SettingsItem,
  SettingsSection,
} from "../../shared/types";
import { getChangelog } from "./release";
import { getYapmod } from "../../core/scope";
import { requestNotificationPermission } from "../../core/notify";
import { ChangelogList } from "./changelog";

const SECTION_ID = "yapmod";
const CHANGELOG_SECTION_ID = "yapmod-changelog";
const GROUP_LABEL = "Yapmod";

type ToggleItem = Extract<SettingsItem, { type: "toggle" }>;

/**
 * Builds a toggle that keeps itself in sync with the store, so a re-render
 * still shows what is actually stored.
 */
function createToggle(
  options: {
    id: string;
    label: string;
    description: string;
    fallback: boolean;
    onChange?: (value: boolean) => void;
  },
): ToggleItem {
  const store = getYapmod().store;

  const item: ToggleItem = {
    type: "toggle",
    id: options.id,
    label: options.label,
    description: options.description,
    value: store?.get(options.id, options.fallback) ?? options.fallback,
    onChange: (value) => {
      item.value = value;
      store?.set(options.id, value);
      options.onChange?.(value);
    },
  };

  store?.onChange(options.id, (value: unknown) => {
    if (typeof value === "boolean") {
      item.value = value;
    }
  });

  return item;
}

function mountChangelog(
  host: HTMLElement,
  releases: ReleaseEntry[],
  installedVersion: string | undefined,
): () => void {
  return render(
    () => (
      <ChangelogList
        releases={releases}
        installedVersion={installedVersion}
      />
    ),
    host,
  );
}

/**
 * Builds the section that shows the full changelog, one entry per release.
 *
 * The list is fetched when the section is opened, so it never travels with
 * the page.
 */
function createChangelogSection(): SettingsSection {
  const yapmod = getYapmod();
  const installedVersion = yapmod.release?.version;

  return {
    id: CHANGELOG_SECTION_ID,
    label: "Changelog",
    icon: "history",
    group: GROUP_LABEL,
    order: 2,
    description: "Every yapmod release, newest first.",
    render: (host) => {
      let cancelled = false;
      let dispose: (() => void) | null = null;

      void getChangelog()
        .then((releases) => {
          if (cancelled) {
            return;
          }

          dispose = mountChangelog(host, releases, installedVersion);
        })
        .catch((error: unknown) => {
          console.error("[yapmod] could not load the changelog", error);
        });

      return () => {
        cancelled = true;
        dispose?.();
      };
    },
  };
}

/**
 * Registers the section that holds yapmod's own settings, so the desktop
 * client is configurable from inside Yapper's settings modal.
 */
export function installDefaultSettings(): void {
  const yapmod = getYapmod();

  if (!yapmod.settings || !yapmod.store) {
    return;
  }

  const items: SettingsItem[] = [];

  if (yapmod.os === "macos") {
    items.push(
      createToggle({
        id: "use_native_titlebar",
        label: "Use native titlebar",
        description:
          "Show the standard macOS titlebar instead of the overlay. Takes effect after a restart.",
        fallback: false,
      }),
    );
  }

  items.push(
    createToggle({
      id: "start_maximized",
      label: "Start maximized",
      description: "Open yapmod maximized. Takes effect after a restart.",
      fallback: false,
    }),
    createToggle({
      id: "auto_update",
      label: "Check for updates automatically",
      description:
        "Look for yapmod app and client updates when the app starts and show update prompts.",
      fallback: true,
    }),
    createToggle({
      id: "notifications",
      label: "Desktop notifications",
      description:
        "Show a notification in the notification center when a message arrives while the window is in the background.",
      fallback: true,
      onChange: (value) => {
        if (value) {
          void requestNotificationPermission();
        }
      },
    }),
    createToggle({
      id: "unread_badge",
      label: "Show the unread badge",
      description:
        "Put the number of unread messages on the dock or taskbar icon.",
      fallback: true,
    }),
    createToggle({
      id: "keep_in_tray",
      label:
        yapmod.os === "macos"
          ? "Keep running in the menu bar"
          : "Keep running in the system tray",
      description:
        yapmod.os === "macos"
          ? "Show an icon in the menu bar and keep yapmod running when you close the window, so notifications keep arriving. Quit from the menu bar."
          : "Show an icon in the system tray and keep yapmod running when you close the window, so notifications keep arriving. Quit from the tray menu.",
      fallback: true,
    }),
  );

  const section: SettingsSection = {
    id: SECTION_ID,
    label: GROUP_LABEL,
    icon: "monitor",
    group: GROUP_LABEL,
    order: 0,
    description: "Options for the yapmod desktop client.",
    items,
    render: (host) => {
      const appVersion = yapmod.release?.version ?? "unknown";
      const clientVersion = yapmod.clientVersion ?? "embedded";

      return render(
        () => (
          <p class="hint yapmod-version">
            Desktop v{appVersion} · Client v{clientVersion}
          </p>
        ),
        host,
      );
    },
  };

  yapmod.settings.register(section);
  yapmod.settings.register(createChangelogSection());
}
