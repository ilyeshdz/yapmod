import {
  checkForUpdate,
  prepareClientUpdate,
  showClientUpdateOutcomeBanner,
  showClientUpdateBanner,
  showUpdateAvailableModal,
} from "./shared/update";
import { upsertStyle, createElement } from "./shared/ui";
import { remountThemeStyles } from "./shared/theme/engine";
import { getYapmod } from "./core/scope";
import { invokeCommand } from "./core/tauri";
import type {
  ClientUpdateInfo,
  ClientUpdateLaunchStatus,
  UpdateInfo,
} from "./shared/types";

const STYLE_ELEMENT_ID = "yapmod-injected-styles";
const TOPBAR_SELECTOR = ".topbar";
const WINDOW_CONTROLS_ATTRIBUTE = "data-yapmod-window-controls";

function applyCss(css: string): void {
  upsertStyle(STYLE_ELEMENT_ID, css);

  // The stylesheet of the theme stays behind the styles of the client, so
  // a theme can style every part of the app.
  remountThemeStyles();
}

/**
 * Mirrors the operating system on the root element, so the stylesheet can
 * tell macOS apart from the other platforms.
 */
function applyOsAttribute(): void {
  const os = getYapmod().os;

  if (os) {
    document.documentElement.dataset.yapmodOs = os;
  }
}

function markTopbarDraggable(topbar: HTMLElement): void {
  // `deep` makes the whole topbar draggable while its buttons and links still
  // receive their clicks.
  if (topbar.getAttribute("data-tauri-drag-region") !== "deep") {
    topbar.setAttribute("data-tauri-drag-region", "deep");
  }
}

type WindowAction = "minimize" | "maximize" | "close";

const WINDOW_ACTIONS: Array<{
  action: WindowAction;
  label: string;
  command: string;
  icon: string;
}> = [
  {
    action: "minimize",
    label: "Minimize window",
    command: "minimize_main_window",
    icon: '<path d="M5 12h14" />',
  },
  {
    action: "maximize",
    label: "Maximize or restore window",
    command: "toggle_main_window_maximize",
    icon: '<rect x="6.5" y="6.5" width="11" height="11" />',
  },
  {
    action: "close",
    label: "Close window",
    command: "close_main_window",
    icon: '<path d="m7 7 10 10M17 7 7 17" />',
  },
];

function createWindowControls(): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "yapmod-window-controls";
  controls.setAttribute(WINDOW_CONTROLS_ATTRIBUTE, "");
  // The topbar is a deep drag region. Explicitly opt this subtree out so
  // Tauri does not treat the window buttons as drag gestures on Windows.
  controls.setAttribute("data-tauri-drag-region", "false");
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Window controls");

  for (const { action, label, command, icon } of WINDOW_ACTIONS) {
    const button = document.createElement("button");
    button.className = `yapmod-window-control yapmod-window-control-${action}`;
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void invokeCommand<void>(command).catch((error: unknown) => {
        console.error(`[yapmod] could not ${action} the window`, error);
      });
    });
    controls.append(button);
  }

  return controls;
}

function addWindowControls(topbar: HTMLElement): void {
  if (topbar.querySelector(`[${WINDOW_CONTROLS_ATTRIBUTE}]`)) {
    return;
  }

  const controls = createWindowControls();
  if (window.getComputedStyle(topbar).position === "static") {
    topbar.style.position = "relative";
  }
  controls.classList.add("yapmod-window-controls-overlay");

  topbar.append(controls);
}

/**
 * Yapper's topbar is a drag region on macOS and hosts custom window controls
 * on Windows. It is painted after the app boots, hence the observer.
 */
function installTopbarWindowControls(): void {
  const os = getYapmod().os;
  if (os !== "macos" && os !== "windows") {
    return;
  }

  const integrateTopbars = (): void => {
    document
      .querySelectorAll<HTMLElement>(TOPBAR_SELECTOR)
      .forEach((topbar) => {
        markTopbarDraggable(topbar);
        if (os === "windows") {
          addWindowControls(topbar);
        }
      });
  };

  integrateTopbars();

  new MutationObserver(integrateTopbars).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * Checks both update channels while the app is open. Client updates are staged
 * in the background and can be applied with one real process restart.
 */
async function scheduleUpdatePrompts(): Promise<void> {
  const yapmod = getYapmod();
  let launchStatus: ClientUpdateLaunchStatus | null = null;
  let rollbackVersion: string | null = null;

  try {
    launchStatus = await invokeCommand<ClientUpdateLaunchStatus>(
      "get_client_update_launch_status",
    );
  } catch (error) {
    console.error("[yapmod] could not read the client update launch status", error);
  }

  if (launchStatus?.trial) {
    try {
      await invokeCommand<void>("confirm_client_update");
    } catch (error) {
      console.error("[yapmod] client update confirmation failed", error);
    }
  } else if (launchStatus?.rolledBack) {
    rollbackVersion = yapmod.clientVersion ?? "unknown";
  }

  const autoUpdate = yapmod.store?.get<boolean>("auto_update", true) !== false;
  let desktopUpdate: UpdateInfo | null = null;
  let clientUpdate: ClientUpdateInfo | null = null;

  if (autoUpdate) {
    const desktopCheck = checkForUpdate();
    const clientCheck =
      launchStatus && !launchStatus.trial && !launchStatus.rolledBack
        ? prepareClientUpdate(yapmod.clientVersion ?? "unknown")
        : Promise.resolve(null);
    const [desktopResult, clientResult] = await Promise.all([
      desktopCheck,
      clientCheck,
    ]);
    desktopUpdate = desktopResult;
    clientUpdate = clientResult;
  }

  if (desktopUpdate?.available && yapmod.modal) {
    try {
      const modal = showUpdateAvailableModal(desktopUpdate);
      if (modal) await modal.closed;
    } catch (error) {
      console.error("[yapmod] failed to show the update modal", error);
    }
  }

  if (rollbackVersion) {
    const key = `yapmod-client-update-outcome:rollback:${rollbackVersion}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {}

    if (!seen) showClientUpdateOutcomeBanner(rollbackVersion);
  }

  if (clientUpdate) {
    try {
      showClientUpdateBanner(clientUpdate);
    } catch (error) {
      console.error("[yapmod] failed to show the client update banner", error);
    }
  }
}

try {
  applyOsAttribute();
} catch (error) {
  console.error("[yapmod] failed to apply OS attribute", error);
}

try {
  installTopbarWindowControls();
} catch (error) {
  console.error("[yapmod] failed to install titlebar controls", error);
}

// The stylesheet of the theme is moved behind the stylesheets of the app,
// so a theme can style the app with plain CSS.
try {
  remountThemeStyles();
} catch (error) {
  console.error("[yapmod] failed to remount theme styles", error);
}

getYapmod().applyCss = applyCss;

void scheduleUpdatePrompts();
