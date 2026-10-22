import type { UpdateInfo, YapmodModal } from "./types";
import { invokeCommand } from "./tauri";
import { openExternally } from "./links";
import { createElement } from "./ui";
import { getYapmod } from "./scope";

const WEBSITE_URL = "https://ilyeshdz.github.io/yapmod";
const UPDATE_MODAL_ID = "yapmod-update-available";
const UPDATE_MODAL_TITLE = "Update available";

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

function createVersionRow(
  label: string,
  version: string,
  className: string,
): HTMLElement {
  return createElement("div", {
    className: `yapmod-update-version ${className}`,
    children: [
      createElement("span", {
        className: "yapmod-update-version-label",
        text: label,
      }),
      createElement("span", {
        className: "yapmod-update-version-number",
        text: version ? `v${version}` : "unknown",
      }),
    ],
  });
}

/**
 * Builds the body of the update modal: just the two versions.
 */
export function createUpdateContent(info: UpdateInfo): HTMLElement {
  return createElement("div", {
    className: "yapmod-update-content",
    children: [
      createVersionRow(
        "Installed",
        info.current_version,
        "yapmod-update-version-installed",
      ),
      createVersionRow(
        "Latest",
        info.latest_version,
        "yapmod-update-version-latest",
      ),
    ],
  });
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

  return modal.show({
    id: UPDATE_MODAL_ID,
    title: UPDATE_MODAL_TITLE,
    description: `yapmod v${info.latest_version} is out. Download it from the website.`,
    content: createUpdateContent(info),
    size: "sm",
    className: "yapmod-update-modal",
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
