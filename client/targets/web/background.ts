import {
  isCatalogUrl,
  isFetchMessage,
  MAX_CATALOG_BYTES,
  type FetchResponse,
} from "./catalog";
import {
  isUpdateUrl,
  MAX_BUNDLE_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_SIGNATURE_BYTES,
} from "./update-feed";
import { extensionRuntime } from "./extension";

function isAllowedUrl(url: string): boolean {
  return isCatalogUrl(url) || isUpdateUrl(url);
}

function limitFor(url: string): number {
  if (isUpdateUrl(url)) {
    if (url.endsWith("/bundle.json")) {
      return MAX_BUNDLE_BYTES;
    }

    return url.endsWith("/manifest.sig")
      ? MAX_SIGNATURE_BYTES
      : MAX_MANIFEST_BYTES;
  }

  return MAX_CATALOG_BYTES;
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  if (!isAllowedUrl(url)) {
    throw new Error(
      "the background worker only reads the community catalogs and the client update feed",
    );
  }

  const limit = Math.min(maxBytes, limitFor(url));
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`the request failed with status ${response.status}`);
  }

  const length = Number(response.headers.get("content-length") ?? "0");

  if (length > limit) {
    throw new Error("the downloaded file is larger than the allowed size");
  }

  const text = await response.text();

  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new Error("the downloaded file is larger than the allowed size");
  }

  return text;
}

const runtime = extensionRuntime();

runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (!isFetchMessage(message)) {
    return false;
  }

  void fetchText(message.url, message.maxBytes)
    .then((text): FetchResponse => ({ ok: true, text }))
    .catch((error: unknown): FetchResponse => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    .then(sendResponse);

  return true;
});
