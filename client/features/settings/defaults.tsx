import { render } from "solid-js/web";

import type {
  ReleaseEntry,
  SettingsItem,
  SettingsSection,
} from "../../shared/types";
import { getChangelog } from "./release";
import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";
import { requestNotificationPermission } from "../../core/notify";
import { ChangelogList } from "./changelog";
import { openBugReport } from "../bug-report/api";

const SECTION_ID = "yapmod";
const CHANGELOG_SECTION_ID = "yapmod-changelog";
const GROUP_LABEL = "Yapmod";

type ToggleItem = Extract<SettingsItem, { type: "toggle" }>;
type SliderItem = Extract<SettingsItem, { type: "slider" }>;

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
    disabled?: boolean;
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
    disabled: options.disabled,
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

/**
 * Builds a slider that keeps itself in sync with the store.
 */
function createSlider(
  options: {
    id: string;
    label: string;
    description: string;
    fallback: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    onChange?: (value: number) => void;
  },
): SliderItem {
  const store = getYapmod().store;

  const item: SliderItem = {
    type: "slider",
    id: options.id,
    label: options.label,
    description: options.description,
    value: store?.get(options.id, options.fallback) ?? options.fallback,
    min: options.min,
    max: options.max,
    step: options.step,
    disabled: options.disabled,
    onChange: (value) => {
      item.value = value;
      store?.set(options.id, value);
      options.onChange?.(value);
    },
  };

  store?.onChange(options.id, (value: unknown) => {
    if (typeof value === "number") {
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
 * client is configurable from inside Yapin's settings modal.
 */
export function installDefaultSettings(): void {
  const yapmod = getYapmod();

  if (!yapmod.settings || !yapmod.store) {
    return;
  }

  const items: SettingsItem[] = [];
  const host = getHost();
  const capabilities = host.capabilities;
  const desktop = host.id === "desktop";

  if (desktop && yapmod.os === "macos") {
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

  if (desktop) {
    items.push(
      createToggle({
        id: "start_maximized",
        label: "Start maximized",
        description: "Open yapmod maximized. Takes effect after a restart.",
        fallback: false,
      }),
    );
  }

  if (capabilities.updates === "app-and-client" || capabilities.updates === "client") {
    items.push(
      createToggle({
        id: "auto_update",
        label: "Check for updates automatically",
        description: desktop
          ? "Look for yapmod app and client updates when the app starts and show update prompts."
          : "Look for signed client updates when the page loads and show update prompts.",
        fallback: true,
      }),
    );
  }

  if (capabilities.notifications) {
    items.push(
      createToggle({
        id: "notifications",
        label: desktop ? "Desktop notifications" : "Notifications",
        description: desktop
          ? "Show a notification in the notification center when a message arrives while the window is in the background."
          : "Show a browser notification when a message arrives while the Yapin tab is in the background.",
        fallback: true,
        onChange: (value) => {
          if (value) {
            void requestNotificationPermission();
          }
        },
      }),
    );
  }

  if (capabilities.badge) {
    items.push(
      createToggle({
        id: "unread_badge",
        label: "Show the unread badge",
        description:
          "Put the number of unread messages on the dock or taskbar icon.",
        fallback: true,
      }),
    );
  }

  if (desktop) {
    items.push(
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
  }

  // --- Transparency setting (desktop only) ---
  if (desktop) {
    const transparencySupported =
      yapmod.os === "macos" || yapmod.os === "windows";

    items.push(
      createToggle({
        id: "enable_transparency",
        label: "Window transparency",
        description: transparencySupported
          ? "Use the system's frosted-glass effect behind the window. Changes apply immediately."
          : "Window transparency is not supported on this platform.",
        fallback: false,
        disabled: !transparencySupported,
      }),
    );

    if (transparencySupported) {
      items.push(
        createToggle({
          id: "transparency_force_themes",
          label: "Force theme transparency",
          description:
            "Make the active theme's panels translucent when window transparency is on, even if the theme uses opaque backgrounds.",
          fallback: false,
        }),
      );

      items.push(
        createSlider({
          id: "transparency_level",
          label: "Transparency level",
          description:
            "Adjust how transparent the theme panels appear when force transparency is enabled. Lower values are more transparent, higher values are more opaque.",
          fallback: 30,
          min: 5,
          max: 80,
          step: 1,
        }),
      );
    }
  }

  if (yapmod.modal) {
    items.push({
      type: "button",
      id: "report_bug",
      label: "Report a bug",
      onClick: () => openBugReport(),
    });
  }

  const section: SettingsSection = {
    id: SECTION_ID,
    label: GROUP_LABEL,
    icon: "monitor",
    group: GROUP_LABEL,
    order: 0,
    description: desktop
      ? "Options for the yapmod desktop client."
      : "Options for the yapmod browser extension.",
    items,
    render: (host) => {
      const appVersion = yapmod.release?.version ?? "unknown";
      const clientVersion = yapmod.clientVersion ?? "embedded";

      return render(
        () => (
          <p class="hint yapmod-version">
            {desktop
              ? `Desktop v${appVersion} · Client v${clientVersion}`
              : `Extension v${appVersion} · Client v${clientVersion}`}
          </p>
        ),
        host,
      );
    },
  };

  yapmod.settings.register(section);

  if (capabilities.releaseNotes && host.release) {
    yapmod.settings.register(createChangelogSection());
  }
}
