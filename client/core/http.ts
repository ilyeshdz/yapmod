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

// Module-level state — shared across all wrapped fetch calls.
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
 * Returns whether a content type carries text that can safely be decoded.
 */
function isTextContentType(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("javascript") ||
    type.includes("x-www-form-urlencoded")
  );
}

/**
 * Reads a request body through a disposable copy and normalizes it.
 *
 * `Request.body` is always a stream, so the metadata cannot be extracted
 * synchronously. The observation request is never sent, which makes reading
 * it safe. Text bodies are decoded; other bodies are copied as an ArrayBuffer.
 */
async function readRequestBody(request: Request): Promise<string | ArrayBuffer | undefined> {
  if (request.body === null) {
    return undefined;
  }
  try {
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return undefined;
    }
    if (isTextContentType(request.headers.get("content-type") ?? "")) {
      return new TextDecoder().decode(arrayBuffer);
    }
    const dest = new ArrayBuffer(arrayBuffer.byteLength);
    new Uint8Array(dest).set(new Uint8Array(arrayBuffer));
    return dest;
  } catch {
    // Body may already be consumed, streamed, or otherwise unreadable.
    return undefined;
  }
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
 * - Notifies subscribers of every outgoing request when it is sent.
 * - Notifies subscribers of every complete exchange when the response arrives.
 * - Keeps no history — subscribers that need past data must retain it themselves.
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
      requestBody = await readRequestBody(observeRequest);
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

    // Notify outgoing request subscribers.
    notifyHandlers(outgoingHandlers, outgoingMsg);

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
      notifyHandlers(exchangeHandlers, exchangeMsg);
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

    notifyHandlers(exchangeHandlers, exchangeMsg);

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
