import logoSvg from "./assets/icon.svg";
import type { ReleaseInfo, YapmodModal } from "./shared/types";
import { createReleaseBody, createReleaseHeader } from "./shared/release";
import { checkForUpdate, showUpdateAvailableModal } from "./shared/update";
import { upsertStyle, createElement } from "./shared/ui";
import { remountThemeStyles } from "./shared/theme/engine";
import { getYapmod } from "./shared/scope";

const STYLE_ELEMENT_ID = "yapmod-injected-styles";
const TOPBAR_SELECTOR = ".topbar";
const RELEASE_SEEN_KEY = "yapmod-release-seen";
const RELEASE_LOGO = logoSvg.replace(/fill="#F67567"/g, 'fill="currentColor"');

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

/**
 * Yapper's topbar is the titlebar on macOS, so it has to drag the window.
 * The topbar is painted after the app boots, hence the observer.
 */
function ensureTopbarDraggable(): void {
  if (getYapmod().os !== "macos") {
    return;
  }

  const markTopbars = (): void => {
    document
      .querySelectorAll<HTMLElement>(TOPBAR_SELECTOR)
      .forEach(markTopbarDraggable);
  };

  markTopbars();

  new MutationObserver(markTopbars).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function createReleaseHero(release: ReleaseInfo): HTMLElement {
  return createElement("div", {
    className: "yapmod-release-hero",
    attrs: { "aria-hidden": "true" },
    children: [
      createElement("div", {
        className: "yapmod-release-logo",
        html: RELEASE_LOGO,
      }),
      createReleaseHeader(release, {
        className: "yapmod-release-hero-text",
        versionClassName: "yapmod-release-version",
        dateClassName: "yapmod-release-date",
        eyebrow: release.firstRun ? "Welcome" : "What's new",
        eyebrowClassName: "yapmod-release-eyebrow",
      }),
    ],
  });
}

function createReleaseContent(release: ReleaseInfo): HTMLElement {
  const fallback = release.firstRun
    ? "Thanks for giving yapmod a try. It's still early in development, so expect a few rough edges while it grows."
    : `yapmod has been updated to v${release.version}.`;

  return createReleaseBody(release.notes, fallback);
}

function releaseDescription(release: ReleaseInfo): string {
  if (release.firstRun) {
    return "A quick look at what's included in this release.";
  }

  if (release.previousVersion) {
    return `Updated from v${release.previousVersion} to v${release.version}.`;
  }

  return `You're now running v${release.version}.`;
}

function shouldShowRelease(release: ReleaseInfo): boolean {
  if (!release.version) {
    return false;
  }

  if (!release.firstRun && release.previousVersion === release.version) {
    return false;
  }

  try {
    if (
      sessionStorage.getItem(`${RELEASE_SEEN_KEY}:${release.version}`) === "1"
    ) {
      return false;
    }
  } catch {}

  return true;
}

function showReleaseModal(release: ReleaseInfo): YapmodModal | null {
  const modalApi = getYapmod().modal;

  if (!shouldShowRelease(release) || !modalApi) {
    return null;
  }

  const modal = modalApi.show({
    id: "yapmod-release-notes",
    title: release.firstRun ? "Welcome to yapmod" : "What's new",
    description: releaseDescription(release),
    content: createReleaseContent(release),
    size: "md",
    className: "yapmod-release-modal",
    buttons: [
      {
        label: release.firstRun ? "Let's go" : "Got it",
        variant: "secondary",
        className: "small",
        autofocus: true,
      },
    ],
  });

  modal.dialog.insertBefore(createReleaseHero(release), modal.dialog.firstChild);

  try {
    sessionStorage.setItem(`${RELEASE_SEEN_KEY}:${release.version}`, "1");
  } catch {}

  return modal;
}

function scheduleReleaseModal(): Promise<void> {
  const yapmod = getYapmod();
  const release = yapmod.release;

  if (!release || !yapmod.modal || !shouldShowRelease(release)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const show = (): void => {
      let modal: YapmodModal | null = null;

      try {
        modal = showReleaseModal(release);
      } catch (error) {
        console.error("[yapmod] failed to show the release notes modal", error);
      }

      if (!modal) {
        resolve();
        return;
      }

      void modal.closed.then(
        () => resolve(),
        () => resolve(),
      );
    };

    const appMounted = (): boolean =>
      document.querySelector(".app, .auth-wrap, main") !== null;

    if (appMounted()) {
      window.setTimeout(show, 200);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!appMounted()) {
        return;
      }

      observer.disconnect();
      window.setTimeout(show, 200);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setTimeout(() => {
      observer.disconnect();
      show();
    }, 8000);
  });
}

/**
 * Looks for a newer yapmod version and shows the update modal when there is
 * one.
 *
 * yapmod never updates itself, so the modal only points the user to the
 * website. The check runs right away, but the modal waits for the release
 * notes, so the two never stack up.
 */
async function scheduleUpdateModal(releaseDone: Promise<void>): Promise<void> {
  const yapmod = getYapmod();

  if (!yapmod.modal) {
    return;
  }

  if (yapmod.store?.get<boolean>("auto_update", true) === false) {
    return;
  }

  const info = await checkForUpdate();

  if (!info?.available) {
    return;
  }

  await releaseDone;

  try {
    showUpdateAvailableModal(info);
  } catch (error) {
    console.error("[yapmod] failed to show the update modal", error);
  }
}

try {
  applyOsAttribute();
} catch (error) {
  console.error("[yapmod] failed to apply OS attribute", error);
}

try {
  ensureTopbarDraggable();
} catch (error) {
  console.error("[yapmod] failed to make the topbar draggable", error);
}

// The stylesheet of the theme is moved behind the stylesheets of the app,
// so a theme can style the app with plain CSS.
try {
  remountThemeStyles();
} catch (error) {
  console.error("[yapmod] failed to remount theme styles", error);
}

getYapmod().applyCss = applyCss;

void scheduleUpdateModal(scheduleReleaseModal());
