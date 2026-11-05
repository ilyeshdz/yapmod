import { FETCH_MESSAGE, type FetchResponse } from "./catalog";
import { sendRuntimeMessage } from "./extension";

/**
 * Catalog requests go through the background worker, which has the extension's
 * host permissions. A direct request is kept for running the bundle outside an
 * extension during development.
 */
async function directFetchText(url: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`the request failed with status ${response.status}`);
  }

  const length = Number(response.headers.get("content-length") ?? "0");

  if (length > maxBytes) {
    throw new Error("the downloaded file is larger than the allowed size");
  }

  const text = await response.text();

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("the downloaded file is larger than the allowed size");
  }

  return text;
}

export async function fetchCatalogText(
  url: string,
  maxBytes: number,
): Promise<string> {
  let proxied: FetchResponse | null = null;

  try {
    proxied = await sendRuntimeMessage<FetchResponse>({
      type: FETCH_MESSAGE,
      url,
      maxBytes,
    });
  } catch {
    proxied = null;
  }

  if (proxied) {
    if (!proxied.ok) {
      throw new Error(proxied.error);
    }

    return proxied.text;
  }

  return directFetchText(url, maxBytes);
}

export async function fetchCatalogJson<T>(
  url: string,
  maxBytes: number,
): Promise<T> {
  return JSON.parse(await fetchCatalogText(url, maxBytes)) as T;
}
