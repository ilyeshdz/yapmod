import type {
  ClientUpdateInfo,
  UpdateInfo,
  YapmodModal,
} from "../../shared/types";
import { getHost } from "../../platform/host";
import { openExternally } from "../../core/links";
import { getYapmod } from "../../core/scope";
import { showBanner } from "../banners/api";
import { mountUpdateContent } from "./update-content";

const WEBSITE_URL = "https://ilyeshdz.github.io/yapmod";
const UPDATE_MODAL_ID = "yapmod-update-available";
const UPDATE_MODAL_TITLE = "Update available";
const CLIENT_UPDATE_BANNER_ID = "yapmod-client-update-ready";

export async function prepareClientUpdate(
  currentClientVersion: string,
): Promise<ClientUpdateInfo | null> {
  try {
    return (
      (await getHost().updates?.prepareClientUpdate(currentClientVersion)) ?? null
    );
  } catch (error) {
    console.error("[yapmod] the client update check failed", error);
    return null;
  }
}

/**
 * Asks the backend for the newest published release.
 *
 * The check never fails loudly: a network problem simply means there is no
 * update to show.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    return (await getHost().updates?.check()) ?? null;
  } catch (error) {
    console.error("[yapmod] the update check failed", error);
    return null;
  }
}

/** Builds the body of the update modal: just the two versions. */
export function createUpdateContent(
  info: UpdateInfo,
): { element: HTMLElement; dispose: () => void } {
  return mountUpdateContent(info);
}

/**
 * Shows the "update available" modal.
 *
 * If the host supports automatic app updates, the modal offers "Download & Install".
 * Otherwise it falls back to pointing the user to the website.
 */
export function showUpdateAvailableModal(info: UpdateInfo): YapmodModal | null {
  const modal = getYapmod().modal;

  if (!modal) {
    return null;
  }

  const content = createUpdateContent(info);
  const product = "yapmod";
  const target = info.release_url || WEBSITE_URL;
  const host = getHost();
  const canAutoUpdate = !!host.updates?.installAppUpdate;

  const buttons = canAutoUpdate
    ? [
        {
          label: "Download & Install",
          variant: "native" as const,
          className: "small",
          onClick: async () => {
            try {
              await host.updates?.installAppUpdate?.();
            } catch (error) {
              console.error("[yapmod] the app update install failed", error);
            }
          },
        },
        {
          label: "Later",
          variant: "native" as const,
          className: "small ghost",
        },
      ]
    : [
        {
          label: "Go to website",
          variant: "native" as const,
          className: "small",
          onClick: () => {
            openExternally(target);
          },
        },
        {
          label: "Later",
          variant: "native" as const,
          className: "small ghost",
        },
      ];

  return modal.show({
    id: UPDATE_MODAL_ID,
    title: UPDATE_MODAL_TITLE,
    description: canAutoUpdate
      ? `yapmod v${info.latest_version} is out. Download and install it now.`
      : `${product} v${info.latest_version} is out. Download it from the website.`,
    content: content.element,
    size: "sm",
    className: "yapmod-update-modal",
    onClose: () => content.dispose(),
    buttons,
  });
}

/** Shows a nonblocking restart banner once the signed client bundle is staged. */
export function showClientUpdateBanner(info: ClientUpdateInfo): void {
  const web = getHost().id === "web";

  showBanner({
    id: CLIENT_UPDATE_BANNER_ID,
    message: web
      ? `yapmod client v${info.latestVersion} is ready. Reload to apply.`
      : `yapmod client v${info.latestVersion} is ready. Restart to apply; active calls will disconnect.`,
    action: {
      label: web ? "Reload" : "Restart",
      onClick: async (banner) => {
        try {
          const updates = getHost().updates;

          if (!updates) {
            throw new Error("This target does not support applying updates.");
          }

          await updates.restart();
        } catch (error) {
          console.error(
            "[yapmod] could not restart for the client update",
            error,
          );
          banner.setMessage(
            web
              ? "yapmod could not reload. Reload the page to apply the update."
              : "yapmod could not restart. Quit from the menu bar or system tray to apply the update.",
            "warning",
          );
        }
      },
    },
  });
}

/** Reports a failed client update without blocking the app. */
export function showClientUpdateOutcomeBanner(version: string): void {
  showBanner({
    id: `yapmod-client-update-rollback:${version}`,
    tone: "warning",
    message: `The client update did not start correctly, so yapmod restored the previous version. You can keep using the app.`,
  });
}
