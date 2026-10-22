import { invokeCommand } from "./tauri";
import { getYapmod } from "./scope";

const OPEN_URL_COMMAND = "plugin:opener|open_url";
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const VISIT_BUTTON_LABEL = "visit site";
const LEAVING_URL_SELECTOR = ".leaving-url";
const DEDUPE_WINDOW_MS = 1000;

const recentlyOpened = new Map<string, number>();

/**
 * Whether a host belongs to the app.
 *
 * The host comes from the backend, so both sides agree on what counts as
 * an internal link.
 */
function isInternalHost(host: string): boolean {
  const internal = getYapmod().internalHost;

  if (!internal) {
    return false;
  }

  const normalized = host.toLowerCase();

  return normalized === internal || normalized.endsWith(`.${internal}`);
}

function resolveUrl(target: unknown): URL | null {
  if (target instanceof URL) {
    return target;
  }

  if (typeof target !== "string" || target.trim() === "") {
    return null;
  }

  try {
    return new URL(target, window.location.href);
  } catch {
    return null;
  }
}

function isExternalUrl(url: URL): boolean {
  if (!EXTERNAL_PROTOCOLS.has(url.protocol)) {
    return false;
  }

  if (url.protocol === "mailto:" || url.protocol === "tel:") {
    return true;
  }

  return !isInternalHost(url.hostname);
}

/**
 * Hands a URL to the operating system, so it opens in the default browser
 * instead of a webview we have no window for.
 */
export function openExternally(url: URL | string): void {
  const href = typeof url === "string" ? url : url.href;
  const now = Date.now();
  const previous = recentlyOpened.get(href);

  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) {
    return;
  }

  recentlyOpened.set(href, now);

  invokeCommand(OPEN_URL_COMMAND, { url: href }).catch((error: unknown) => {
    console.error("[yapmod] failed to open external link", href, error);
  });
}

function createWindowStub(href: string): Window {
  const stub = {
    closed: false,
    focus: () => {},
    blur: () => {},
    close: () => {
      stub.closed = true;
    },
    postMessage: () => {},
    location: { href },
  };

  return stub as unknown as Window;
}

/**
 * Webviews have no window to open a new tab in, so `window.open` silently
 * does nothing. Yapper uses it to hand external links to the browser, so we
 * take over that call and open the URL ourselves.
 */
function installWindowOpenPatch(): void {
  const original = window.open;

  window.open = function patchedOpen(
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null {
    const resolved = resolveUrl(url);

    if (resolved && isExternalUrl(resolved)) {
      openExternally(resolved);

      return createWindowStub(resolved.href);
    }

    return original.call(window, url as string, target, features);
  };
}

/**
 * Reads the URL out of the "Leaving Yapper" confirmation dialog, which
 * renders it as `https://<host>/path` across two elements.
 */
function readLeavingUrl(scope: ParentNode): string | null {
  const element = scope.querySelector(LEAVING_URL_SELECTOR);

  if (!element) {
    return null;
  }

  const text = element.textContent?.trim();

  if (!text || !/^(https?:)?\/\//i.test(text)) {
    return null;
  }

  const resolved = resolveUrl(text);

  return resolved && isExternalUrl(resolved) ? resolved.href : null;
}

/**
 * Fallback for the confirmation dialog: if its "Visit site" button does not
 * go through `window.open`, we open the URL shown in the dialog ourselves.
 */
function installLeavingDialogHandler(): void {
  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest("button");

      if (!button) {
        return;
      }

      const label = button.textContent?.trim().toLowerCase();

      if (label !== VISIT_BUTTON_LABEL) {
        return;
      }

      const dialog = button.closest('[role="dialog"], .modal') ?? document;
      const url = readLeavingUrl(dialog);

      if (!url) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      openExternally(url);
    },
    true,
  );
}

export function installExternalLinks(): void {
  installWindowOpenPatch();
  installLeavingDialogHandler();
}
