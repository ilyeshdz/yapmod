import type { YapmodStoreApi } from "../shared/types";
import { invokeCommand } from "./tauri";
import { getYapmod } from "./scope";

const FLUSH_DELAY_MS = 300;
const LOCAL_STORAGE_PREFIX = "yapmod_store_";

function lsKey(key: string): string {
  return LOCAL_STORAGE_PREFIX + key;
}

/**
 * Key/value store for yapmod's own settings.
 *
 * Reads come from the config snapshot the preinject bundle already ships, so
 * they never touch the IPC bridge. Writes are applied optimistically and
 * persisted in a single debounced batch.
 *
 * Every write is also saved to localStorage as a backup so that settings
 * survive if the app closes before the debounced IPC flush completes.
 * On startup, any localStorage values that are not already in the loaded
 * config are restored into the store.
 */
export function installStore(): void {
  const yapmod = getYapmod();
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const pending = new Map<string, unknown>();

  let flushTimer: number | undefined;

  for (const [key, value] of Object.entries(yapmod.config?.settings ?? {})) {
    values.set(key, value);
  }

  // Restore any values from localStorage that were not persisted to the
  // backend config (e.g., the app closed before the flush completed).
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(LOCAL_STORAGE_PREFIX) && !values.has(key.slice(LOCAL_STORAGE_PREFIX.length))) {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          values.set(key.slice(LOCAL_STORAGE_PREFIX.length), JSON.parse(stored));
        }
      }
    }
  } catch {
    // localStorage unavailable; continue without backup.
  }

  function notify(key: string, value: unknown): void {
    const bucket = listeners.get(key);

    if (!bucket) {
      return;
    }

    for (const listener of [...bucket]) {
      try {
        listener(value);
      } catch (error) {
        console.error("[yapmod] store listener failed", error);
      }
    }
  }

  function flush(): Promise<void> {
    if (flushTimer !== undefined) {
      window.clearTimeout(flushTimer);
      flushTimer = undefined;
    }

    if (pending.size === 0) {
      return Promise.resolve();
    }

    const batch: Record<string, unknown> = {};

    for (const [key, value] of pending) {
      batch[key] = value;
    }

    pending.clear();

    return invokeCommand<void>("set_settings", { values: batch }).then(() => {
      // Clear the localStorage backup for keys that were successfully flushed.
      for (const key of Object.keys(batch)) {
        try {
          localStorage.removeItem(lsKey(key));
        } catch {
          // localStorage unavailable.
        }
      }
    }).catch(
      (error: unknown) => {
        console.error("[yapmod] could not persist settings", error);
      },
    );
  }

  function scheduleFlush(): void {
    if (flushTimer !== undefined) {
      return;
    }

    flushTimer = window.setTimeout(() => {
      void flush();
    }, FLUSH_DELAY_MS);
  }

  // A pending write must not be lost when the app goes away.
  const persistOnHide = (): void => {
    if (document.visibilityState === "hidden") {
      void flush();
    }
  };

  window.addEventListener("pagehide", () => {
    void flush();
  });

  document.addEventListener("visibilitychange", persistOnHide);

  const store: YapmodStoreApi = {
    get<T>(key: string, fallback?: T): T {
      if (values.has(key)) {
        return values.get(key) as T;
      }

      return fallback as T;
    },

    set(key: string, value: unknown): void {
      values.set(key, value);
      pending.set(key, value);
      notify(key, value);
      scheduleFlush();
      // Backup to localStorage immediately so the value survives if the app
      // closes before the debounced IPC flush completes.
      try {
        localStorage.setItem(lsKey(key), JSON.stringify(value));
      } catch {
        // localStorage unavailable or quota exceeded; the debounced flush
        // will still persist the value.
      }
    },

    all(): Record<string, unknown> {
      return Object.fromEntries(values);
    },

    onChange(key: string, listener: (value: unknown) => void): () => void {
      const bucket = listeners.get(key) ?? new Set();
      bucket.add(listener);
      listeners.set(key, bucket);

      return () => {
        bucket.delete(listener);
        if (bucket.size === 0) {
          listeners.delete(key);
        }
      };
    },

    flush,
  };

  yapmod.store = store;
}
