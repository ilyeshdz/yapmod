import type {
  ClientUpdateInfo,
  UpdateInfo,
  YapmodModal,
} from "../../shared/types";
import { invokeCommand } from "../../core/tauri";
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
    return await invokeCommand<ClientUpdateInfo | null>("prepare_client_update", {
      currentClientVersion,
    });
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
    return await invokeCommand<UpdateInfo>("check_for_update");
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
 * yapmod cannot update itself, so the modal only points the user to the
 * website, where the new version can be downloaded.
 */
export function showUpdateAvailableModal(info: UpdateInfo): YapmodModal | null {
  const modal = getYapmod().modal;

  if (!modal) {
    return null;
  }

  const content = createUpdateContent(info);

  return modal.show({
    id: UPDATE_MODAL_ID,
    title: UPDATE_MODAL_TITLE,
    description: `yapmod v${info.latest_version} is out. Download it from the website.`,
    content: content.element,
    size: "sm",
    className: "yapmod-update-modal",
    onClose: () => content.dispose(),
    buttons: [
      {
        label: "Go to website",
        variant: "native",
        className: "small",
        onClick: () => {
          openExternally(WEBSITE_URL);
        },
      },
      {
        label: "Later",
        variant: "native",
        className: "small ghost",
      },
    ],
  });
}

/** Shows a nonblocking restart banner once the signed client bundle is staged. */
export function showClientUpdateBanner(info: ClientUpdateInfo): void {
  showBanner({
    id: CLIENT_UPDATE_BANNER_ID,
    message: `yapmod client v${info.latestVersion} is ready. Restart to apply; active calls will disconnect.`,
    action: {
      label: "Restart",
      onClick: async (banner) => {
        try {
          await invokeCommand<void>("restart_app");
        } catch (error) {
          console.error(
            "[yapmod] could not restart for the client update",
            error,
          );
          banner.setMessage(
            "yapmod could not restart. Quit from the menu bar or system tray to apply the update.",
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
