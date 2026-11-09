/**
 * The synchronized cache between the isolated bridge and the page loader.
 *
 * `localStorage` is shared by both worlds and can be read synchronously at
 * `document_start`, which a content script cannot do with extension storage.
 * The bridge writes a bundle only after it verifies the signed manifest and
 * the bundle hash.
 */

export type CachedClientBundle = {
  clientVersion: string;
  releaseSequence: number;
  /** Unix seconds, copied from the signed manifest. */
  expiresAt: number;
  preinject: string;
  /** Set once the running client boots successfully. */
  confirmed: boolean;
  /**
   * How many times the loader has tried this bundle. An unconfirmed bundle is
   * removed after one attempt, which rolls back a broken client update.
   */
  attempts: number;
};

export function cacheKey(): string {
  return "yapmod:client-bundle";
}

function isCachedClientBundle(value: unknown): value is CachedClientBundle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const bundle = value as Partial<CachedClientBundle>;

  return (
    typeof bundle.clientVersion === "string" &&
    bundle.clientVersion.length > 0 &&
    Number.isSafeInteger(bundle.releaseSequence) &&
    (bundle.releaseSequence ?? 0) > 0 &&
    typeof bundle.expiresAt === "number" &&
    Number.isFinite(bundle.expiresAt) &&
    typeof bundle.preinject === "string" &&
    bundle.preinject.length > 0 &&
    typeof bundle.confirmed === "boolean" &&
    Number.isSafeInteger(bundle.attempts) &&
    (bundle.attempts ?? -1) >= 0
  );
}

export function readCachedBundle(): CachedClientBundle | null {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey());

    if (!raw) {
      return null;
    }

    const value: unknown = JSON.parse(raw);

    return isCachedClientBundle(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedBundle(bundle: CachedClientBundle): void {
  try {
    globalThis.localStorage?.setItem(cacheKey(), JSON.stringify(bundle));
  } catch {
    // The cache is an optimization; the embedded client still runs.
  }
}

export function removeCachedBundle(): void {
  try {
    globalThis.localStorage?.removeItem(cacheKey());
  } catch {
    // Nothing to clean up.
  }
}

export function confirmCachedBundle(clientVersion: string): void {
  const bundle = readCachedBundle();

  if (!bundle || bundle.clientVersion !== clientVersion) {
    return;
  }

  writeCachedBundle({ ...bundle, confirmed: true, attempts: 0 });
}

/** A bundle that is still valid and new enough to run. */
export function activeCachedBundle(now = Date.now()): CachedClientBundle | null {
  const bundle = readCachedBundle();

  if (!bundle || bundle.expiresAt * 1000 <= now) {
    return null;
  }

  if (!bundle.confirmed && bundle.attempts > 0) {
    // The previous load never confirmed this bundle. Revert it.
    removeCachedBundle();
    return null;
  }

  return bundle;
}
