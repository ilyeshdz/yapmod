import type {
  ReleaseEntry,
  SettingsItem,
  SettingsSection,
} from "./types";
import {
  createReleaseBody,
  formatReleaseDate,
  getChangelog,
} from "./release";
import { createElement } from "./ui";
import { getYapmod } from "./scope";
import { requestNotificationPermission } from "./notify";

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

  store?.onChange(options.id, (value) => {
    if (typeof value === "boolean") {
      item.value = value;
    }
  });

  return item;
}

/**
 * Renders one entry per release, newest first.
 */
function renderChangelog(
  host: HTMLElement,
  releases: ReleaseEntry[],
  installedVersion: string | undefined,
): void {
  if (releases.length === 0) {
    host.appendChild(
      createElement("p", {
        className: "yapmod-changelog-empty",
        text: "No releases yet.",
      }),
    );
    return;
  }

  for (const release of releases) {
    const date = formatReleaseDate(release.notes?.date);
    const metadata = [
      date
        ? createElement("span", {
            className: "hint",
            text: date,
          })
        : null,
      release.version === installedVersion
        ? createElement("span", {
            className: "hint",
            text: "Current version",
          })
        : null,
    ].filter((item): item is HTMLElement => item !== null);

    const entryChildren: Node[] = [
      createElement("header", {
        className: "yapmod-changelog-header",
        children: [
          createElement("div", {
            className: "toggle-label",
            text: `Version ${release.version}`,
          }),
          ...(metadata.length
            ? [
                createElement("div", {
                  className: "yapmod-changelog-meta",
                  children: metadata,
                }),
              ]
            : []),
        ],
      }),
    ];

    const title = release.notes?.title;

    if (title) {
      entryChildren.push(
        createElement("h3", {
          className: "yapmod-changelog-title",
          text: title,
        }),
      );
    }

    entryChildren.push(createReleaseBody(release.notes));

    host.appendChild(
      createElement("article", {
        className: "yapmod-changelog-release",
        children: entryChildren,
      }),
    );
  }
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
    group: GROUP_LABEL,
    order: 2,
    description: "Every yapmod release, newest first.",
    render: (host) => {
      let cancelled = false;

      void getChangelog()
        .then((releases) => {
          if (!cancelled) {
            renderChangelog(host, releases, installedVersion);
          }
        })
        .catch((error: unknown) => {
          console.error("[yapmod] could not load the changelog", error);
        });

      return () => {
        cancelled = true;
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
        "Look for new yapmod versions when the app starts and show the update window.",
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
    group: GROUP_LABEL,
    order: 0,
    description: "Options for the yapmod desktop client.",
    items,
    render: (host) => {
      const appVersion = yapmod.release?.version ?? "unknown";
      const clientVersion = yapmod.clientVersion ?? "embedded";

      host.append(
        createElement("p", {
          className: "hint yapmod-version",
          text: `Desktop v${appVersion} · Client v${clientVersion}`,
        }),
      );
    },
  };

  yapmod.settings.register(section);
  yapmod.settings.register(createChangelogSection());
}
