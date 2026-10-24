import { createElement } from "./ui";
import { getYapmod } from "../core/scope";

const BANNER_REGION_ID = "yapmod-banner-region";

export type BannerTone = "primary" | "warning";

export type YapmodBanner = {
  setMessage(message: string, tone?: BannerTone): void;
  dismiss(): void;
};

export type BannerOptions = {
  id: string;
  message: string;
  tone?: BannerTone;
  action?: {
    label: string;
    onClick: (banner: YapmodBanner) => void | Promise<void>;
  };
  dismissible?: boolean;
};

export type YapmodBannerApi = {
  show(options: BannerOptions): YapmodBanner;
  dismiss(id: string): void;
};

type BannerEntry = {
  element: HTMLElement;
  setMessage: (message: string, tone?: BannerTone) => void;
  dismiss: () => void;
};

const banners = new Map<string, BannerEntry>();
let region: HTMLElement | null = null;
let placementObserver: MutationObserver | null = null;

function ensureRegion(): HTMLElement | null {
  if (!placementObserver && document.documentElement) {
    placementObserver = new MutationObserver(() => {
      ensureRegion();
    });
    placementObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  const topbar = document.querySelector<HTMLElement>(".topbar");
  if (!topbar?.parentElement) return null;

  const parent = topbar.parentElement;

  if (!region) {
    region = document.getElementById(BANNER_REGION_ID);
    if (!region) {
      region = createElement("div", {
        className: "yapmod-banner-region",
        attrs: {
          id: BANNER_REGION_ID,
          role: "region",
          "aria-label": "yapmod notifications",
        },
      });
    }
  }

  if (region.parentElement !== parent || topbar.nextElementSibling !== region) {
    topbar.insertAdjacentElement("afterend", region);
  }

  for (const entry of banners.values()) {
    if (entry.element.parentElement !== region) region.append(entry.element);
  }

  return region;
}

function createBanner(options: BannerOptions): BannerEntry {
  const message = createElement("span", {
    className: "yapmod-banner-message",
    text: options.message,
  });

  const element = createElement("div", {
    className: "yapmod-banner",
    attrs: { role: options.tone === "warning" ? "alert" : "status" },
    dataset: { tone: options.tone ?? "primary" },
    children: [message],
  });

  const banner: YapmodBanner = {
    setMessage(nextMessage, tone = "primary") {
      message.textContent = nextMessage;
      element.dataset.tone = tone;
      element.setAttribute("role", tone === "warning" ? "alert" : "status");
    },
    dismiss() {
      element.remove();
      banners.delete(options.id);
    },
  };

  if (options.action) {
    const action = createElement("button", {
      className: "yapmod-banner-action",
      text: options.action.label,
      attrs: { type: "button" },
      on: {
        click: () => {
          void Promise.resolve(options.action?.onClick(banner)).catch((error) => {
            console.error("[yapmod] banner action failed", error);
          });
        },
      },
    });
    element.append(action);
  }

  if (options.dismissible !== false) {
    element.append(
      createElement("button", {
        className: "yapmod-banner-dismiss",
        text: "×",
        attrs: {
          type: "button",
          "aria-label": "Dismiss notification",
        },
        on: { click: () => banner.dismiss() },
      }),
    );
  }

  return {
    element,
    setMessage: banner.setMessage,
    dismiss: banner.dismiss,
  };
}

/** Adds or updates a nonblocking banner directly below Yapper's topbar. */
export function showBanner(options: BannerOptions): YapmodBanner {
  let entry = banners.get(options.id);

  if (entry) {
    entry.setMessage(options.message, options.tone);
    ensureRegion();
    return { setMessage: entry.setMessage, dismiss: entry.dismiss };
  }

  entry = createBanner(options);
  banners.set(options.id, entry);
  ensureRegion()?.append(entry.element);

  return { setMessage: entry.setMessage, dismiss: entry.dismiss };
}

const bannerApi: YapmodBannerApi = {
  show: showBanner,
  dismiss(id) {
    banners.get(id)?.dismiss();
  },
};

export function installBannerApi(): void {
  getYapmod().banner = bannerApi;
}
