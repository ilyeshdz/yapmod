/**
 * Creates an idempotent unsubscribe function that removes a handler from an
 * array on first call. Subsequent calls are no-ops.
 */
export function createUnsubscribe<T>(
  handlers: T[],
  handler: T,
): () => void {
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  };
}

/**
 * Notifies all registered handlers of a new message.
 * A single handler throwing does not prevent the remaining handlers from running.
 */
export function notifyHandlers<T>(
  handlers: ((msg: T) => void)[],
  message: T,
): void {
  const snapshot = handlers.slice();
  for (const handler of snapshot) {
    try {
      handler(message);
    } catch (error) {
      console.error("[yapmod] inspector handler threw an error", error);
    }
  }
}

/**
 * Copies an ArrayBuffer into a new ArrayBuffer so that mutating the original
 * does not corrupt the copy.
 */
export function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const dest = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(dest).set(new Uint8Array(buffer));
  return dest;
}

/**
 * Copies the bytes covered by an ArrayBufferView's offset and length into a
 * new ArrayBuffer.
 */
export function copyArrayBufferView(view: ArrayBufferView): ArrayBuffer {
  const dest = new ArrayBuffer(view.byteLength);
  new Uint8Array(dest).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return dest;
}
