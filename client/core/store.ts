import type { YapmodStoreApi } from "../shared/types";
import { invokeCommand } from "./tauri";
import { getYapmod } from "./scope";

const FLUSH_DELAY_MS = 300;

/**
 * Key/value store for yapmod's own settings.
 *
 * Reads come from the config snapshot the preinject bundle already ships, so
 * they never touch the IPC bridge. Writes are applied optimistically and
 * persisted in a single debounced batch.
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

    return invokeCommand<void>("set_settings", { values: batch }).catch(
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
