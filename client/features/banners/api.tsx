import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import { getYapmod } from "../../core/scope";
import { BannerView } from "./banner";

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
      region = document.createElement("div");
      region.className = "yapmod-banner-region";
      region.id = BANNER_REGION_ID;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", "yapmod notifications");
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
  const [message, setMessageText] = createSignal(options.message);
  const [tone, setTone] = createSignal<BannerTone>(options.tone ?? "primary");

  let entry: BannerEntry;

  const banner: YapmodBanner = {
    setMessage(nextMessage, nextTone = "primary") {
      setMessageText(nextMessage);
      setTone(nextTone);
    },
    dismiss() {
      entry.dismiss();
    },
  };

  const host = document.createElement("div");
  const dispose = render(
    () => (
      <BannerView
        message={message()}
        tone={tone()}
        dismissible={options.dismissible !== false}
        action={options.action}
        banner={banner}
        onDismiss={() => entry.dismiss()}
      />
    ),
    host,
  );

  const element = host.firstElementChild as HTMLElement;

  entry = {
    element,
    setMessage: banner.setMessage,
    dismiss() {
      dispose();
      element.remove();
      banners.delete(options.id);
    },
  };

  return entry;
}

/** Adds or updates a nonblocking banner directly below Yapper's topbar. */
export function showBanner(options: BannerOptions): YapmodBanner {
  const existing = banners.get(options.id);

  if (existing) {
    existing.setMessage(options.message, options.tone);
    ensureRegion();
    return {
      setMessage: existing.setMessage,
      dismiss: existing.dismiss,
    };
  }

  const entry = createBanner(options);
  banners.set(options.id, entry);
  ensureRegion()?.append(entry.element);

  return {
    setMessage: entry.setMessage,
    dismiss: entry.dismiss,
  };
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
