/**
 * The static community theme catalog.
 *
 * Both the content script and the background worker use these limits. The
 * worker only fetches URLs below the catalog base, so the page cannot turn it
 * into a general-purpose proxy.
 */
export const CATALOG_BASE =
  "https://ilyeshdz.github.io/yapmod/community-themes";
export const THEME_API = 1;
export const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_CSS_BYTES = 1024 * 1024;
export const DEFAULT_CSS_FILE = "theme.css";

export const FETCH_MESSAGE = "yapmod:fetch-catalog-text";

export type FetchMessage = {
  type: typeof FETCH_MESSAGE;
  url: string;
  maxBytes: number;
};

export type FetchResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function isFetchMessage(value: unknown): value is FetchMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Partial<FetchMessage>;

  return (
    message.type === FETCH_MESSAGE &&
    typeof message.url === "string" &&
    typeof message.maxBytes === "number" &&
    Number.isFinite(message.maxBytes)
  );
}

export function isCatalogUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.origin === new URL(CATALOG_BASE).origin &&
      url.href.startsWith(`${CATALOG_BASE}/`)
    );
  } catch {
    return false;
  }
}
