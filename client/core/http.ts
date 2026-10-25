import { getYapmod } from "./scope";
import type {
  BlobSnapshot,
  HTTPInspector,
  HTTPMessage,
  HTTPMessageHandler,
  HTTPOutgoingInterceptor,
  HTTPOutgoingMessage,
  HTTPOutgoingMessageHandler,
} from "../shared/types";

const MAX_MESSAGES = 5000;

// Module-level state — shared across all wrapped fetch calls.
const exchanges: HTTPMessage[] = [];
const outgoingMessages: HTTPOutgoingMessage[] = [];
const exchangeHandlers: HTTPMessageHandler[] = [];
const outgoingHandlers: HTTPOutgoingMessageHandler[] = [];
const outgoingInterceptors: HTTPOutgoingInterceptor[] = [];

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
 * - Intercepts outgoing requests to allow plugins to modify request configuration.
 * - Maintains a bounded history of up to `MAX_MESSAGES` entries per channel.
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

    // Resolve the request input to extract URL and method.
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    const method = request.method;
    const requestHeaders = extractHeaders(request.headers);

    // Clone the request body for observation before it's consumed.
    const requestClone = request.clone();
    let requestBody: string | ArrayBuffer | BlobSnapshot | undefined;
    try {
      const bodyBytes = await requestClone.arrayBuffer();
      if (bodyBytes.byteLength > 0) {
        // Copy to prevent mutation.
        const dest = new ArrayBuffer(bodyBytes.byteLength);
        new Uint8Array(dest).set(new Uint8Array(bodyBytes));
        requestBody = dest;
      }
    } catch {
      // Body may already be consumed or unavailable.
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

    // Execute interceptors in registration order.
    // If any interceptor throws or returns an invalid value, the entire
    // chain is discarded and the original request is sent.
    let modifiedInit: RequestInit | undefined;
    let chainFailed = false;

    for (const interceptor of outgoingInterceptors) {
      try {
        const result = interceptor(outgoingMsg);
        if (result !== undefined && result !== void 0) {
          modifiedInit = result;
        }
      } catch (error) {
        console.error(
          "[yapmod] HTTP outgoing interceptor threw an error, sending original request",
          error,
        );
        chainFailed = true;
        break;
      }
    }

    let fetchInput: RequestInfo | URL = input;
    let fetchInit: RequestInit | undefined = init;

    if (!chainFailed && modifiedInit !== undefined) {
      // Apply the modified init by creating a new Request.
      // Merge the modified init with the original request's properties.
      const mergedInit: RequestInit = {
        ...modifiedInit,
        method: modifiedInit.method ?? method,
        headers: modifiedInit.headers ?? request.headers,
        body: modifiedInit.body,
      };
      fetchInput = url;
      fetchInit = mergedInit;
    }

    // Perform the actual fetch.
    let response: Response;
    try {
      response = await OriginalFetch(fetchInput, fetchInit);
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

    // Clone the response so we can read the body without consuming the original.
    const responseClone = response.clone();

    // Read response headers.
    const responseHeaders = extractHeaders(response.headers);

    // Read response body asynchronously.
    const responseBody = await readResponseBody(responseClone);

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

    return response;
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
      /**
       * Registers an outgoing interceptor; returns a cleanup function.
       * The cleanup function is safe to call multiple times (idempotent).
       */
      use(interceptor: HTTPOutgoingInterceptor): () => void {
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

  getYapmod().http = inspector;
}
