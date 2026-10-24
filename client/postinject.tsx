import {
  checkForUpdate,
  prepareClientUpdate,
  showClientUpdateOutcomeBanner,
  showClientUpdateBanner,
  showUpdateAvailableModal,
} from "./features/updates/api";
import { upsertStyle } from "./shared/ui";
import { remountThemeStyles } from "./features/themes/engine";
import { getYapmod } from "./core/scope";
import { invokeCommand } from "./core/tauri";
import { render } from "solid-js/web";
import { WindowControls } from "./features/window-controls/window-controls";
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

function createWindowControls(): HTMLElement {
  const host = document.createElement("div");
  const dispose = render(() => <WindowControls />, host);
  const controls = host.firstElementChild as HTMLElement;

  // The component is static; once it is in the DOM there is nothing left to
  // react to, so the root can be disposed without losing the buttons.
  dispose();

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
