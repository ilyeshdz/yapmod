import { getYapmod } from "./scope";
import type {
  BlobSnapshot,
  HTTPInspector,
  HTTPMessage,
  HTTPMessageHandler,
  HTTPResponseInterceptor,
  HTTPOutgoingMessage,
  HTTPOutgoingMessageHandler,
} from "../shared/types";

const MAX_MESSAGES = 5000;

// Module-level state — shared across all wrapped fetch calls.
const exchanges: HTTPMessage[] = [];
const outgoingMessages: HTTPOutgoingMessage[] = [];
const exchangeHandlers: HTTPMessageHandler[] = [];
const outgoingHandlers: HTTPOutgoingMessageHandler[] = [];
const responseInterceptors: HTTPResponseInterceptor[] = [];

// Marker property on the global fetch to detect re-installation.
const INSTALLED_MARKER = "__yapmod_http_inspector_installed";

/**
 * Notifies all registered handlers of a new message.
 * A single handler throwing does not prevent the remaining handlers from running.
 */
function notifyHandlers<T>(handlers: ((msg: T) => void)[], message: T): void {
  const snapshot = handlers.slice();
  for (const handler of snapshot) {
    try {
      handler(message);
    } catch (error) {
      console.error("[yapmod] HTTP inspector handler threw an error", error);
    }
  }
}

/**
 * Appends a message to a bounded history list and notifies handlers.
 * The oldest messages are evicted when the limit is reached.
 */
function addMessage<T>(
  list: T[],
  handlers: ((msg: T) => void)[],
  message: T,
): void {
  if (list.length >= MAX_MESSAGES) {
    list.splice(0, list.length - MAX_MESSAGES + 1);
  }
  list.push(message);
  notifyHandlers(handlers, message);
}

/**
 * Normalizes a fetch body payload into an immutable snapshot for the
 * inspector's history.
 *
 * - Strings are returned as-is (strings are immutable in JavaScript).
 * - ArrayBuffer payloads are copied into a new ArrayBuffer so that mutating
 *   the original argument does not corrupt the inspector's history.
 * - ArrayBufferView payloads are copied, accounting for `byteOffset` and
 *   `byteLength`, so that only the view's bytes are captured.
 * - Blob and ReadableStream payloads cannot be read synchronously, so they
 *   are represented as a `BlobSnapshot` containing metadata.
 * - FormData and URLSearchParams are serialized to strings.
 * - null/undefined are returned as undefined (no body).
 *
 * The returned value is safe to store without risk of later mutation by the
 * caller.
 */
function normalizeBodyData(body: unknown): string | ArrayBuffer | BlobSnapshot | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    const dest = new ArrayBuffer(body.byteLength);
    new Uint8Array(dest).set(new Uint8Array(body));
    return dest;
  }
  if (ArrayBuffer.isView(body)) {
    const dest = new ArrayBuffer(body.byteLength);
    new Uint8Array(dest).set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    return dest;
  }
  if (body instanceof Blob) {
    return { __blob: true, type: body.type, size: body.size };
  }
  if (body instanceof FormData) {
    // Serialize FormData to a string representation.
    const pairs: string[] = [];
    body.forEach((value, key) => {
      if (value instanceof File) {
        pairs.push(`${key}: [File: ${value.name}, ${value.type}, ${value.size}B]`);
      } else {
        pairs.push(`${key}: ${value}`);
      }
    });
    return pairs.join("\n");
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof ReadableStream) {
    return { __blob: true, type: "", size: 0 };
  }
  // Fallback — convert to string.
  return String(body);
}

/**
 * Extracts headers from a Headers object or Request into an array of [name, value] pairs.
 */
function extractHeaders(headers: Headers): [string, string][] {
  const result: [string, string][] = [];
  headers.forEach((value, key) => {
    result.push([key, value]);
  });
  return result;
}

/**
 * Reads the response body asynchronously and normalizes it.
 */
async function readResponseBody(response: Response): Promise<string | ArrayBuffer | BlobSnapshot | undefined> {
  try {
    const contentType = response.headers.get("content-type") ?? "";

    // For JSON content, read as text.
    if (contentType.includes("application/json")) {
      const text = await response.text();
      return text;
    }

    // For text-based content, read as text.
    if (contentType.includes("text/") || contentType.includes("application/xml") || contentType.includes("application/html")) {
      const text = await response.text();
      return text;
    }

    // For binary content, read as ArrayBuffer.
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return undefined;
    }
    // Copy to prevent mutation.
    const dest = new ArrayBuffer(arrayBuffer.byteLength);
    new Uint8Array(dest).set(new Uint8Array(arrayBuffer));
    return dest;
  } catch {
    // If we fail to read the body, return undefined.
    return undefined;
  }
}

/**
 * Replaces the global `fetch` function with a wrapper that observes
 * every request's outgoing and incoming data. The original fetch is
 * preserved and all calls are forwarded unchanged.
 *
 * The wrapper:
 * - Records every outgoing request immediately when sent.
 * - Records every complete exchange (request + response) when the response arrives.
 * - Maintains a bounded history of up to `MAX_MESSAGES` entries per channel.
 * - Never modifies the original request — it only observes passively.
 *
 * Calling this function multiple times is safe — the inspector is installed
 * at most once.
 */
export function installHTTPInspector(): void {
  const OriginalFetch = globalThis.fetch;

  // Guard: environments without fetch support.
  if (!OriginalFetch) {
    return;
  }

  // Guard: prevent double-patching.
  if ((OriginalFetch as any)[INSTALLED_MARKER]) {
    return;
  }
  (OriginalFetch as any)[INSTALLED_MARKER] = true;

  // -----------------------------------------------------------------------
  // Wrapped fetch
  // -----------------------------------------------------------------------

  const WrappedFetch: typeof fetch = async function (input, init): Promise<Response> {
    const startTime = Date.now();

    // Observe the request by creating a clone for metadata extraction.
    // We never modify the original request — just pass it through unchanged.
    let url: string, method: string, requestHeaders: [string, string][], requestBody: string | ArrayBuffer | BlobSnapshot | undefined;

    try {
      const observeRequest = input instanceof Request ? input.clone() : new Request(input, init);
      url = observeRequest.url;
      method = observeRequest.method;
      requestHeaders = extractHeaders(observeRequest.headers);
      requestBody = normalizeBodyData(observeRequest.body);
    } catch {
      // If we can't observe (e.g., body already consumed), still record what we can.
      url = input instanceof Request ? input.url : String(input);
      method = input instanceof Request ? input.method : (init?.method ?? 'GET');
      requestHeaders = input instanceof Request ? extractHeaders(input.headers) : [];
      requestBody = undefined;
    }

    // Build the outgoing message for immediate notification.
    const outgoingMsg: HTTPOutgoingMessage = {
      url,
      method,
      requestHeaders,
      requestBody,
      timestamp: startTime,
    };

    // Record outgoing message.
    addMessage(outgoingMessages, outgoingHandlers, outgoingMsg);

    // Perform the actual fetch with the original arguments, unchanged.
    let response: Response;
    try {
      response = await OriginalFetch(input, init);
    } catch (error) {
      // Network error — still record the exchange with error status.
      const duration = Date.now() - startTime;
      const exchangeMsg: HTTPMessage = {
        url,
        method,
        requestHeaders,
        requestBody,
        status: 0,
        statusText: "Network Error",
        responseHeaders: [],
        responseBody: undefined,
        timestamp: startTime,
        duration,
      };
      addMessage(exchanges, exchangeHandlers, exchangeMsg);
      throw error;
    }

    // Read response headers.
    const responseHeaders = extractHeaders(response.headers);

    // Read response body asynchronously from a clone.
    // Wrap in try-catch to handle cases where the response cannot be cloned
    // or the body is already consumed.
    let responseBody: string | ArrayBuffer | BlobSnapshot | undefined;
    try {
      const responseClone = response.clone();
      responseBody = await readResponseBody(responseClone);
    } catch {
      // If we fail to clone or read the body, record the exchange without it.
      responseBody = undefined;
    }

    const duration = Date.now() - startTime;

    const exchangeMsg: HTTPMessage = {
      url,
      method,
      requestHeaders,
      requestBody,
      status: response.status,
      statusText: response.statusText,
      responseHeaders,
      responseBody,
      timestamp: startTime,
      duration,
    };

    addMessage(exchanges, exchangeHandlers, exchangeMsg);

    // Execute response interceptors in registration order.
    // If any interceptor returns a Response, it replaces the current response.
    // If an interceptor throws, the original response is delivered.
    let interceptedResponse: Response = response;
    const snapshot = responseInterceptors.slice();
    for (const interceptor of snapshot) {
      try {
        const result = await interceptor(exchangeMsg);
        if (result instanceof Response) {
          interceptedResponse = result;
        }
      } catch (error) {
        console.error(
          "[yapmod] HTTP response interceptor threw an error, delivering original response",
          error,
        );
        break;
      }
    }

    return interceptedResponse;
  };

  globalThis.fetch = WrappedFetch;

  // -----------------------------------------------------------------------
  // Expose the inspector API
  // -----------------------------------------------------------------------

  const inspector: HTTPInspector = {
    exchanges: {
      /** Returns a shallow copy of the exchange history array. */
      messages(): HTTPMessage[] {
        return exchanges.slice();
      },
      /**
       * Subscribes to HTTP exchanges; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      subscribe(handler: HTTPMessageHandler): () => void {
        exchangeHandlers.push(handler);
        let removed = false;
        return () => {
          if (removed) return;
          removed = true;
          const index = exchangeHandlers.indexOf(handler);
          if (index !== -1) {
            exchangeHandlers.splice(index, 1);
          }
        };
      },
    },
    outgoing: {
      /** Returns a shallow copy of the outgoing request history array. */
      messages(): HTTPOutgoingMessage[] {
        return outgoingMessages.slice();
      },
      /**
       * Subscribes to outgoing requests; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      subscribe(handler: HTTPOutgoingMessageHandler): () => void {
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
    },
    responses: {
      /**
       * Registers a response interceptor; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      use(interceptor: HTTPResponseInterceptor): () => void {
        responseInterceptors.push(interceptor);
        let removed = false;
        return () => {
          if (removed) return;
          removed = true;
          const index = responseInterceptors.indexOf(interceptor);
          if (index !== -1) {
            responseInterceptors.splice(index, 1);
          }
        };
      },
    },
  };

  getYapmod().http = inspector;
}
