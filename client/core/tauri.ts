type InvokeFn = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type TauriInternals = {
  invoke?: InvokeFn;
};

/**
 * Calls a Tauri command straight through the injected IPC bridge.
 *
 * The bridge is looked up lazily: it is not guaranteed to exist while the
 * preinject bundle runs at document start.
 */
export function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const internals = (globalThis as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  const invoke = internals?.invoke;

  if (typeof invoke !== "function") {
    return Promise.reject(
      new Error("[yapmod] the Tauri IPC bridge is not available"),
    );
  }

  return invoke.call(internals, command, args) as Promise<T>;
}
