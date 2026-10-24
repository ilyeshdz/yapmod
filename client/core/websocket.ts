import { getYapmod } from "./scope";
import type {
  WebSocketInspector,
  WebSocketMessage,
  WebSocketMessageHandler,
  WebSocketOutgoingInterceptor,
} from "../shared/types";

const MAX_MESSAGES = 5000;

const incomingMessages: WebSocketMessage[] = [];
const outgoingMessages: WebSocketMessage[] = [];
const incomingHandlers: WebSocketMessageHandler[] = [];
const outgoingHandlers: WebSocketMessageHandler[] = [];
const outgoingInterceptors: WebSocketOutgoingInterceptor[] = [];

function notifyHandlers(handlers: WebSocketMessageHandler[], message: WebSocketMessage): void {
  for (const handler of handlers) {
    try {
      handler(message);
    } catch (error) {
      console.error("[yapmod] WebSocket inspector handler threw an error", error);
    }
  }
}

function addMessage(
  list: WebSocketMessage[],
  handlers: WebSocketMessageHandler[],
  url: string,
  data: string | ArrayBuffer,
): void {
  // Maintain a bounded buffer: drop the oldest messages when the limit is reached.
  if (list.length >= MAX_MESSAGES) {
    list.splice(0, list.length - MAX_MESSAGES + 1);
  }
  const message: WebSocketMessage = { url, data, timestamp: Date.now() };
  list.push(message);
  notifyHandlers(handlers, message);
}

/**
 * Normalizes WebSocket message data to a string or ArrayBuffer for observation.
 */
function normalizeMessageData(data: unknown): string | ArrayBuffer {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    // Copy the buffer content into a new ArrayBuffer for safe observation.
    // data.buffer may be SharedArrayBuffer in rare cases, so we copy to a fresh ArrayBuffer.
    const src = new Uint8Array(data.byteLength);
    src.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return src.buffer as ArrayBuffer;
  }
  if (data instanceof Blob) {
    // For Blob data, observe as an empty placeholder since we cannot
    // synchronously read the blob content. The original send still works.
    return "";
  }
  return String(data);
}

/**
 * Replaces the global `WebSocket` constructor with a wrapper that observes
 * every connection's incoming and outgoing messages. The original WebSocket
 * instance is preserved and all calls are forwarded unchanged.
 */
export function installWebSocketInspector(): void {
  const OriginalWebSocket = globalThis.WebSocket;

  // Guard against re-installation or environments without WebSocket support.
  if (!OriginalWebSocket) {
    return;
  }

  // Prevent double-patching if the inspector is already installed.
  if (OriginalWebSocket.prototype.constructor.name === "YapmodWebSocket") {
    return;
  }

  // Build a wrapper constructor that delegates to the original WebSocket.
  const WrappedWebSocket = function (
    url: string | URL,
    protocols?: string | string[],
  ): WebSocket {
    const resolvedUrl = typeof url === "string" ? url : url.toString();
    const socket = new OriginalWebSocket(url, protocols);

    // Observe outgoing messages (send).
    const originalSend = socket.send.bind(socket);
    socket.send = function (data: string | ArrayBuffer | ArrayBufferView | Blob): void {
      const observed = normalizeMessageData(data);
      addMessage(outgoingMessages, outgoingHandlers, resolvedUrl, observed);

      // Run outgoing interceptors to allow message modification before transmission.
      let sendData: string | ArrayBuffer | ArrayBufferView | Blob = data;
      const message: WebSocketMessage = { url: resolvedUrl, data: observed, timestamp: Date.now() };
      for (const interceptor of outgoingInterceptors) {
        try {
          const result = interceptor(message);
          if (result !== undefined && result !== void 0) {
            // Interceptor returned a replacement payload.
            sendData = result as string | ArrayBuffer | ArrayBufferView | Blob;
            // Update the observed data for subsequent interceptors and the buffer.
            const updatedObserved = normalizeMessageData(sendData);
            // Replace the last added message with the modified version.
            if (outgoingMessages.length > 0) {
              outgoingMessages[outgoingMessages.length - 1].data = updatedObserved;
            }
          }
        } catch (error) {
          console.error("[yapmod] WebSocket outgoing interceptor threw an error, sending original payload", error);
          // Send the original payload — never suppress message delivery.
          break;
        }
      }

      // originalSend expects the native WebSocket.send signature; cast to avoid
      // TS strict SharedArrayBuffer issues with newer lib types.
      originalSend(sendData as Parameters<WebSocket["send"]>[0]);
    };

    // Observe incoming messages (onmessage).
    const originalOnMessage = socket.onmessage;
    socket.onmessage = function (this: WebSocket, event: MessageEvent): void {
      const observed = normalizeMessageData(event.data);
      addMessage(incomingMessages, incomingHandlers, resolvedUrl, observed);

      // Forward to the original handler.
      if (typeof originalOnMessage === "function") {
        originalOnMessage.call(this, event);
      }
    };

    // Also capture messages delivered via addEventListener("message", ...).
    // We wrap the event handler by intercepting addEventListener/removeEventListener.
    const originalAddEventListener = socket.addEventListener.bind(socket);
    const originalRemoveEventListener = socket.removeEventListener.bind(socket);
    const wrappedMessageListeners = new Map<
      EventListener,
      EventListener
    >();

    socket.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type === "message" && typeof listener === "function") {
        const wrapped: EventListener = function (this: WebSocket, event: Event) {
          if (event instanceof MessageEvent) {
            const observed = normalizeMessageData(event.data);
            addMessage(incomingMessages, incomingHandlers, resolvedUrl, observed);
          }
          listener.call(this, event);
        };
        wrappedMessageListeners.set(listener, wrapped);
        return originalAddEventListener("message", wrapped, options);
      }
      return originalAddEventListener(type as keyof WebSocketEventMap, listener, options);
    };

    socket.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void {
      if (type === "message" && typeof listener === "function") {
        const wrapped = wrappedMessageListeners.get(listener);
        if (wrapped) {
          wrappedMessageListeners.delete(listener);
          return originalRemoveEventListener("message", wrapped, options);
        }
      }
      return originalRemoveEventListener(type as keyof WebSocketEventMap, listener, options);
    };

    return socket;
  } as unknown as typeof WebSocket;

  // Preserve the original constructor's prototype so instanceof checks still work.
  WrappedWebSocket.prototype = OriginalWebSocket.prototype;

  globalThis.WebSocket = WrappedWebSocket;

  // Expose the inspector API.
  const inspector: WebSocketInspector = {
    incoming: {
      messages(): WebSocketMessage[] {
        return [...incomingMessages];
      },
      subscribe(handler: WebSocketMessageHandler): () => void {
        incomingHandlers.push(handler);
        return () => {
          const index = incomingHandlers.indexOf(handler);
          if (index !== -1) {
            incomingHandlers.splice(index, 1);
          }
        };
      },
    },
    outgoing: {
      messages(): WebSocketMessage[] {
        return [...outgoingMessages];
      },
      subscribe(handler: WebSocketMessageHandler): () => void {
        outgoingHandlers.push(handler);
        return () => {
          const index = outgoingHandlers.indexOf(handler);
          if (index !== -1) {
            outgoingHandlers.splice(index, 1);
          }
        };
      },
      use(interceptor: WebSocketOutgoingInterceptor): () => void {
        outgoingInterceptors.push(interceptor);
        return () => {
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
