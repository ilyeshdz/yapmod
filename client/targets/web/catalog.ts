/**
 * The static community catalogs.
 *
 * Both the content script and the background worker use these limits. The
 * worker only fetches URLs below a catalog base, so the page cannot turn it
 * into a general-purpose proxy.
 */
export const THEME_CATALOG_BASE =
  "https://ilyeshdz.github.io/yapmod/community-themes";
export const PLUGIN_CATALOG_BASE =
  "https://ilyeshdz.github.io/yapmod/community-plugins";
const CATALOG_BASES = [THEME_CATALOG_BASE, PLUGIN_CATALOG_BASE];

export const PLUGIN_API = 1;
export const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_CSS_BYTES = 1024 * 1024;
export const MAX_PLUGIN_CSS_BYTES = 512 * 1024;
export const MAX_PLUGIN_SCRIPT_BYTES = 512 * 1024;

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
    const origin = url.origin;

    return CATALOG_BASES.some((base) => {
      const baseUrl = new URL(base);

      return (
        url.protocol === "https:" &&
        origin === baseUrl.origin &&
        url.href.startsWith(`${base}/`)
      );
    });
  } catch {
    return false;
  }
}
