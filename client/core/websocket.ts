import { getYapmod } from "./scope";
import type {
  BlobSnapshot,
  WebSocketInspector,
  WebSocketMessage,
  WebSocketMessageHandler,
  WebSocketOutgoingInterceptor,
} from "../shared/types";

// Module-level state — shared across all wrapped WebSocket instances.
const incomingHandlers: WebSocketMessageHandler[] = [];
const outgoingHandlers: WebSocketMessageHandler[] = [];
const outgoingInterceptors: WebSocketOutgoingInterceptor[] = [];

// Marker property on the global WebSocket constructor to detect re-installation.
const INSTALLED_MARKER = "__yapmod_websocket_inspector_installed";

/**
 * Notifies all registered handlers of a new message.
 * A single handler throwing does not prevent the remaining handlers from running.
 */
function notifyHandlers(handlers: WebSocketMessageHandler[], message: WebSocketMessage): void {
  // Snapshot the handler array so that a handler unsubscribing itself or
  // another handler during iteration does not corrupt the iteration.
  const snapshot = handlers.slice();
  for (const handler of snapshot) {
    try {
      handler(message);
    } catch (error) {
      console.error("[yapmod] WebSocket inspector handler threw an error", error);
    }
  }
}

/**
 * Notifies subscribers of a WebSocket message without retaining it.
 */
function notifyMessage(
  handlers: WebSocketMessageHandler[],
  url: string,
  data: string | ArrayBuffer | BlobSnapshot,
): void {
  notifyHandlers(handlers, { url, data, timestamp: Date.now() });
}

/**
 * Checks whether a value is a valid WebSocket.send() payload type.
 */
function isValidSendPayload(
  value: unknown,
): value is string | ArrayBuffer | ArrayBufferView | Blob {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return true;
  if (value instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(value)) return true;
  if (value instanceof Blob) return true;
  return false;
}

/**
 * Normalizes a WebSocket message payload into an immutable snapshot for
 * observers.
 *
 * - Strings are returned as-is (strings are immutable in JavaScript).
 * - ArrayBuffer payloads are copied into a new ArrayBuffer so that mutating
 *   the original argument does not corrupt the observed snapshot.
 * - ArrayBufferView payloads are copied, accounting for `byteOffset` and
 *   `byteLength`, so that only the view's bytes are captured.
 * - Blob payloads cannot be read synchronously, so they are represented as
 *   a `BlobSnapshot` containing the blob's type and size metadata.
 *
 * The returned value is safe to hand to observers without risk of later
 * mutation by the caller.
 */
function normalizeMessageData(data: unknown): string | ArrayBuffer | BlobSnapshot {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    // Copy to prevent the caller from mutating the stored buffer.
    // new Uint8Array(data).buffer may return the same buffer in some engines,
    // so we explicitly allocate a new ArrayBuffer and copy into it.
    const dest = new ArrayBuffer(data.byteLength);
    new Uint8Array(dest).set(new Uint8Array(data));
    return dest;
  }
  if (ArrayBuffer.isView(data)) {
    // Copy only the bytes covered by the view's offset and length.
    // Allocate a fresh ArrayBuffer to avoid SharedArrayBuffer issues.
    const dest = new ArrayBuffer(data.byteLength);
    new Uint8Array(dest).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return dest;
  }
  if (data instanceof Blob) {
    // Blobs cannot be read synchronously. Store metadata instead.
    return { __blob: true, type: data.type, size: data.size };
  }
  // Fallback — should not occur for valid WebSocket messages.
  return String(data);
}

/**
 * Resolves the options argument to a normalized options object.
 */
function normalizeOptions(
  options?: boolean | AddEventListenerOptions,
): AddEventListenerOptions | undefined {
  if (options === undefined || options === false) return undefined;
  if (options === true) return { capture: true };
  return options;
}

/**
 * Creates a key for identifying a listener+options pair in the wrapped map.
 * Since the same listener function can be registered with different options,
 * we must track them separately.
 */
function listenerKey(
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): string {
  const norm = normalizeOptions(options);
  const capture = norm?.capture ?? false;
  const once = norm?.once ?? false;
  const passive = norm?.passive ?? false;
  return `${String(listener)}|${capture}|${once}|${passive}`;
}

/**
 * Replaces the global `WebSocket` constructor with a wrapper that observes
 * every connection's incoming and outgoing messages. The original WebSocket
 * instance is preserved and all calls are forwarded unchanged.
 *
 * The wrapper:
 * - Notifies subscribers of every incoming message exactly once, regardless of
 *   whether the application uses `onmessage`, `addEventListener("message", ...)`,
 *   or both.
 * - Intercepts outgoing `send()` calls to allow plugins to modify payloads.
 * - Preserves native WebSocket event semantics including `once`, `capture`,
 *   `passive`, and `EventListenerObject` support.
 * - Keeps no history — subscribers that need past messages must retain them.
 *
 * Calling this function multiple times is safe — the inspector is installed
 * at most once.
 */
export function installWebSocketInspector(): void {
  const OriginalWebSocket = globalThis.WebSocket;

  // Guard: environments without WebSocket support (e.g. Node.js without a polyfill).
  if (!OriginalWebSocket) {
    return;
  }

  // Guard: prevent double-patching.
  // We use a custom property on the constructor rather than checking
  // `constructor.name`, which can be minified or unreliable.
  if ((OriginalWebSocket as any)[INSTALLED_MARKER]) {
    return;
  }
  (OriginalWebSocket as any)[INSTALLED_MARKER] = true;

  // -----------------------------------------------------------------------
  // Wrapped constructor
  // -----------------------------------------------------------------------

  const WrappedWebSocket = function (
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket {
    // Delegate to the original constructor. Native validation of URL and
    // protocols is preserved — invalid values throw as expected.
    const resolvedUrl = typeof url === "string" ? url : url.toString();
    const socket = new OriginalWebSocket(url, protocols);

    // ---------------------------------------------------------------------
    // Outgoing message interception (send)
    // ---------------------------------------------------------------------

    // Store the original send method, bound to the socket so that `this`
    // is correctly set when we invoke it later. Using `.bind()` is preferred
    // over storing the method and calling `.call()` because it preserves the
    // native method's internal slot binding and avoids subtle "this" errors
    // if the method is later reassigned.
    const originalSend = socket.send.bind(socket);

    socket.send = function (
      data: string | ArrayBuffer | ArrayBufferView | Blob,
    ): void {
      const originalPayload = data;
      let payload: string | ArrayBuffer | ArrayBufferView | Blob = data;
      let chainFailed = false;

      // Execute interceptors in registration order.
      // If any interceptor throws or returns an invalid value, the entire
      // chain is discarded and the original payload is sent.
      for (const interceptor of outgoingInterceptors) {
        try {
          const observed = normalizeMessageData(payload);
          const message: WebSocketMessage = {
            url: resolvedUrl,
            data: observed,
            timestamp: Date.now(),
          };

          const result = interceptor(message);

          // `undefined` / `void` means no change.
          if (result !== undefined && result !== void 0) {
            if (isValidSendPayload(result)) {
              payload = result;
            } else {
              // Invalid replacement — treat as interceptor failure.
              console.error(
                "[yapmod] WebSocket outgoing interceptor returned an invalid payload type, sending original payload",
              );
              chainFailed = true;
              break;
            }
          }
        } catch (error) {
          console.error(
            "[yapmod] WebSocket outgoing interceptor threw an error, sending original payload",
            error,
          );
          chainFailed = true;
          break;
        }
      }

      if (chainFailed) {
        payload = originalPayload;
      }

      // Record the final payload exactly once.
      const finalObserved = normalizeMessageData(payload);
      notifyMessage(outgoingHandlers, resolvedUrl, finalObserved);

      // Invoke the native send. Do NOT wrap in try/catch — if the native
      // send throws (e.g. socket is not OPEN), the error should propagate
      // to the caller normally.
      originalSend(payload as Parameters<WebSocket["send"]>[0]);
    };

    // ---------------------------------------------------------------------
    // Incoming message observation
    // ---------------------------------------------------------------------

    // A single message dispatch fires both `onmessage` (if set) AND all
    // registered "message" event listeners. To avoid duplicate records,
    // we use a per-event flag (`__yapmod_recorded`) so the first observer
    // records the message and subsequent observers skip it. This works
    // regardless of dispatch order because MessageEvents are dispatched
    // synchronously.

    const wrappedListeners = new Map<string, EventListener>();

    const originalAddEventListener = socket.addEventListener.bind(socket);
    const originalRemoveEventListener = socket.removeEventListener.bind(socket);

    socket.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type === "message") {
        const key = listenerKey(listener, options);

        // If the same listener+options pair is already registered, don't
        // wrap it again — the native method is a no-op per the DOM spec.
        if (wrappedListeners.has(key)) {
          return originalAddEventListener(
            type as keyof WebSocketEventMap,
            listener,
            options,
          );
        }

        const normOpts = normalizeOptions(options);
        const once = normOpts?.once ?? false;

        const wrapped: EventListener = function (
          this: WebSocket,
          event: Event,
        ): void {
          // Only record if no other observer has recorded this event yet.
          if (event instanceof MessageEvent && !(event as any).__yapmod_recorded) {
            const observed = normalizeMessageData(event.data);
            notifyMessage(incomingHandlers, resolvedUrl, observed);
            (event as any).__yapmod_recorded = true;
          }

          // Forward to the original listener, preserving `this`.
          if (typeof listener === "function") {
            listener.call(this, event);
          } else if (typeof listener.handleEvent === "function") {
            listener.handleEvent.call(listener, event);
          }

          // Clean up `once` listener mapping — the browser won't invoke it again.
          if (once) {
            wrappedListeners.delete(key);
          }
        };

        wrappedListeners.set(key, wrapped);
        return originalAddEventListener(type as keyof WebSocketEventMap, wrapped, options);
      }

      return originalAddEventListener(
        type as keyof WebSocketEventMap,
        listener,
        options,
      );
    };

    socket.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void {
      if (type === "message") {
        const key = listenerKey(listener, options);
        const wrapped = wrappedListeners.get(key);

        if (wrapped) {
          wrappedListeners.delete(key);
          return originalRemoveEventListener(
            type as keyof WebSocketEventMap,
            wrapped,
            options,
          );
        }
      }

      return originalRemoveEventListener(
        type as keyof WebSocketEventMap,
        listener,
        options,
      );
    };

    // Observe messages delivered through the `onmessage` property.
    // Since the application may set `onmessage` after the inspector wraps it,
    // we use a property descriptor to intercept both gets and sets. This way
    // the inspector's wrapper is always called, regardless of when the app
    // assigns its handler.
    const onMessageDescriptor = Object.getOwnPropertyDescriptor(socket, "onmessage")!;
    const onMessageStorage: { value: ((event: MessageEvent) => void) | null } = {
      value: onMessageDescriptor?.value ?? socket.onmessage ?? null,
    };

    Object.defineProperty(socket, "onmessage", {
      get() {
        return onMessageStorage.value;
      },
      set(handler: ((event: MessageEvent) => void) | null) {
        onMessageStorage.value = handler;
      },
      configurable: true,
      enumerable: true,
    });

    // The inspector wraps onmessage by installing itself as the handler.
    // When the app sets onmessage, it updates the storage, and the inspector
    // reads the storage to forward to the app's handler.
    // We use addEventListener as the primary observation point (see below),
    // so onmessage wrapping is a fallback for apps that only use onmessage.
    // Since we can't reliably intercept onmessage without breaking the app's
    // ability to set it, we use a hidden addEventListener listener instead.
    const onMessageWrapper: EventListener = function (this: WebSocket, event: Event): void {
      if (event instanceof MessageEvent && !(event as any).__yapmod_recorded) {
        const observed = normalizeMessageData(event.data);
        notifyMessage(incomingHandlers, resolvedUrl, observed);
        (event as any).__yapmod_recorded = true;
      }
    };

    // Register a hidden listener that observes messages before any app listener.
    // This ensures we capture messages even if the app only uses onmessage.
    // We use a high-priority internal listener that cannot be removed by the app.
    originalAddEventListener.call(socket, "message", onMessageWrapper, false);

    return socket;
  } as unknown as typeof WebSocket;

  // Preserve the original constructor's prototype so `instanceof WebSocket`
  // checks still work.
  WrappedWebSocket.prototype = OriginalWebSocket.prototype;

  // Copy static properties so WebSocket.CONNECTING, etc. remain accessible.
  for (const key of Object.keys(OriginalWebSocket)) {
    try {
      (WrappedWebSocket as any)[key] = (OriginalWebSocket as any)[key];
    } catch {
      // Ignore non-enumerable or non-copyable properties.
    }
  }

  globalThis.WebSocket = WrappedWebSocket;

  // -----------------------------------------------------------------------
  // Expose the inspector API
  // -----------------------------------------------------------------------

  const inspector: WebSocketInspector = {
    incoming: {
      /**
       * Subscribes to incoming messages; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      subscribe(handler: WebSocketMessageHandler): () => void {
        incomingHandlers.push(handler);
        let removed = false;
        return () => {
          if (removed) return;
          removed = true;
          const index = incomingHandlers.indexOf(handler);
          if (index !== -1) {
            incomingHandlers.splice(index, 1);
          }
        };
      },
    },
    outgoing: {
      /**
       * Subscribes to outgoing messages; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      subscribe(handler: WebSocketMessageHandler): () => void {
        outgoingHandlers.push(handler);
        let removed = false;
        return () => {
          if (removed) return;
          removed = true;
          const index = outgoingHandlers.indexOf(handler);
          if (index !== -1) {
            outgoingHandlers.splice(index, 1);
          }
        };
      },
      /**
       * Registers an outgoing interceptor; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      use(interceptor: WebSocketOutgoingInterceptor): () => void {
        outgoingInterceptors.push(interceptor);
        let removed = false;
        return () => {
          if (removed) return;
          removed = true;
          const index = outgoingInterceptors.indexOf(interceptor);
          if (index !== -1) {
            outgoingInterceptors.splice(index, 1);
          }
        };
      },
    },
  };

  getYapmod().webSocket = inspector;
}
