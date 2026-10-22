import { getScope, getYapmod } from "./scope";
import { invokeCommand } from "./tauri";

/**
 * The bridge the host app looks for.
 *
 * Yapper asks `window.yapperDesktop` for the things a desktop shell can do
 * that a browser cannot, and calls the ones it knows about without checking
 * whether they exist. Everything else falls back to the browser.
 */
export type DesktopBridge = {
  /**
   * The platform the app runs on, in the same shape the host app expects.
   */
  platform: string;
  /**
   * Puts the number of unread messages on the dock or taskbar icon.
   */
  setBadge(count: number | null | undefined): void;
};

/**
 * Installs the desktop bridge the host app talks to.
 *
 * The bundle runs before the page loads, so the bridge is already in place
 * when the host app looks for it. An existing bridge is left alone, since
 * another shell may have installed one already.
 */
export function installDesktopBridge(): void {
  const scope = getScope();

  if (scope.yapperDesktop) {
    return;
  }

  const yapmod = getYapmod();

  const bridge: DesktopBridge = {
    platform: yapmod.os ?? "",

    setBadge(count) {
      if (yapmod.store?.get<boolean>("unread_badge", true) === false) {
        return;
      }

      void invokeCommand<void>("set_badge_count", {
        count:
          typeof count === "number" && Number.isFinite(count) ? count : null,
      }).catch((error: unknown) => {
        console.error("[yapmod] could not set the badge", error);
      });
    },
  };

  scope.yapperDesktop = bridge;
}
