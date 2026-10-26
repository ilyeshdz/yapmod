import { getYapmod } from "./scope";
import type {
  BlobSnapshot,
  HTTPInspector,
  HTTPMessage,
  HTTPMessageHandler,
  HTTPResponseInterceptor,
  HTTPOutgoingInterceptor,
  HTTPOutgoingMessage,
  HTTPOutgoingMessageHandler,
} from "../shared/types";

// Module-level state — shared across all wrapped fetch calls.
const exchangeHandlers: HTTPMessageHandler[] = [];
const outgoingHandlers: HTTPOutgoingMessageHandler[] = [];
const outgoingInterceptors: HTTPOutgoingInterceptor[] = [];
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
 * Normalizes a body supplied by an interceptor into an observer snapshot.
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
  return String(body);
}

/**
 * Copies the fetch options of a request so a modified request can preserve
 * credentials, caching, redirects, signals, and similar settings.
 */
function requestInitFrom(request: Request): RequestInit {
  return {
    method: request.method,
    headers: request.headers,
    body: request.body,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };
}

/**
 * Builds the request that will actually be sent after interceptor patches.
 */
function buildInterceptedRequest(
  base: Request,
  url: string,
  method: string,
  headers: [string, string][],
  body: BodyInit | null | undefined,
): Request {
  // The Request constructor rejects bodies for GET and HEAD.
  const normalizedMethod = method.toUpperCase();
  const finalBody = normalizedMethod === "GET" || normalizedMethod === "HEAD"
    ? null
    : (body === undefined ? base.body : body);
  const init: RequestInit & { duplex?: "half" } = {
    ...requestInitFrom(base),
    method,
    headers,
    body: finalBody,
  };
  // Node's fetch requires an explicit duplex mode for streamed bodies. The
  // field is ignored by browsers but keeps the wrapper portable.
  if (finalBody instanceof ReadableStream) {
    init.duplex = "half";
  }
  return new Request(url, init);
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
 * - Lets interceptors modify outgoing requests before transmission.
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

    // Observe the request by creating a clone for metadata extraction. A
    // second clone is kept as the base for building an intercepted request.
    let url: string, method: string, requestHeaders: [string, string][], requestBody: string | ArrayBuffer | BlobSnapshot | undefined;
    let observed = false;
    let sendBase: Request | undefined;
    const interceptors = outgoingInterceptors.slice();

    try {
      const observeRequest = input instanceof Request ? input.clone() : new Request(input, init);
      if (interceptors.length > 0) {
        sendBase = observeRequest.clone();
      }
      url = observeRequest.url;
      method = observeRequest.method;
      requestHeaders = extractHeaders(observeRequest.headers);
      requestBody = await readRequestBody(observeRequest);
      observed = true;
    } catch {
      // If we can't observe (e.g., body already consumed), still record what we can.
      url = input instanceof Request ? input.url : String(input);
      method = input instanceof Request ? input.method : (init?.method ?? 'GET');
      requestHeaders = input instanceof Request ? extractHeaders(input.headers) : [];
      requestBody = undefined;
    }

    const originalMsg: HTTPOutgoingMessage = {
      url,
      method,
      requestHeaders,
      requestBody,
      timestamp: startTime,
    };
    let outgoingMsg = originalMsg;
    let interceptedBody: BodyInit | null | undefined;
    let modified = false;
    let interceptorFailed = false;

    if (observed && sendBase && interceptors.length > 0) {
      for (const interceptor of interceptors) {
        try {
          const patch = await interceptor(outgoingMsg);
          if (patch === undefined || patch === null) {
            continue;
          }
          if (typeof patch !== "object" || Array.isArray(patch)) {
            throw new Error("HTTP outgoing interceptor returned an invalid patch.");
          }
          if (patch.url !== undefined && typeof patch.url !== "string" && !(patch.url instanceof URL)) {
            throw new Error("HTTP outgoing interceptor returned an invalid URL.");
          }
          if (patch.method !== undefined && typeof patch.method !== "string") {
            throw new Error("HTTP outgoing interceptor returned an invalid method.");
          }
          const nextMethod = patch.method ?? outgoingMsg.method;
          const nextBody = patch.body !== undefined ? patch.body : undefined;
          outgoingMsg = {
            url: patch.url !== undefined ? patch.url.toString() : outgoingMsg.url,
            method: nextMethod,
            requestHeaders: patch.headers !== undefined
              ? extractHeaders(new Headers(patch.headers))
              : outgoingMsg.requestHeaders,
            requestBody: nextBody !== undefined
              ? normalizeBodyData(nextBody)
              : outgoingMsg.requestBody,
            timestamp: startTime,
          };
          if (patch.body !== undefined) {
            interceptedBody = patch.body;
          }
          modified = modified ||
            patch.url !== undefined ||
            patch.method !== undefined ||
            patch.headers !== undefined ||
            patch.body !== undefined;
        } catch (error) {
          console.error(
            "[yapmod] HTTP outgoing interceptor threw an error, sending the original request",
            error,
          );
          interceptorFailed = true;
          break;
        }
      }
    }

    let fetchInput: RequestInfo | URL = input;
    let fetchInit: RequestInit | undefined = init;

    if (interceptorFailed) {
      outgoingMsg = originalMsg;
      modified = false;
    } else if (modified && sendBase) {
      try {
        fetchInput = buildInterceptedRequest(
          sendBase,
          outgoingMsg.url,
          outgoingMsg.method,
          outgoingMsg.requestHeaders,
          interceptedBody,
        );
        fetchInit = undefined;

        // GET/HEAD requests cannot carry a body; reflect what was actually sent.
        const finalMethod = outgoingMsg.method.toUpperCase();
        if (finalMethod === "GET" || finalMethod === "HEAD") {
          outgoingMsg = { ...outgoingMsg, requestBody: undefined };
        }
      } catch (error) {
        console.error(
          "[yapmod] HTTP outgoing interceptor produced an invalid request, sending the original request",
          error,
        );
        outgoingMsg = originalMsg;
        fetchInput = input;
        fetchInit = init;
        modified = false;
      }
    }

    // Notify outgoing request subscribers of the request that is actually sent.
    notifyHandlers(outgoingHandlers, outgoingMsg);

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
      notifyHandlers(exchangeHandlers, exchangeMsg);
      throw error;
    }

    // Read response headers.
    const responseHeaders = extractHeaders(response.headers);

    // Only read a body when somebody can consume it, and never buffer an
    // event stream: doing so would stop the caller from receiving events
    // until the stream closes.
    const contentType = response.headers.get("content-type") ?? "";
    const needsBody = exchangeHandlers.length > 0 || responseInterceptors.length > 0;
    const isEventStream = contentType.toLowerCase().includes("text/event-stream");
    let responseBody: string | ArrayBuffer | BlobSnapshot | undefined;
    if (needsBody && !isEventStream && response.body !== null) {
      try {
        const responseClone = response.clone();
        responseBody = await readResponseBody(responseClone);
      } catch {
        // If we fail to clone or read the body, report the exchange without it.
        responseBody = undefined;
      }
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
        // Discard earlier modifications as well, matching the documented
        // all-or-nothing interceptor contract.
        interceptedResponse = response;
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
      /**
       * Registers an outgoing request interceptor; returns a cleanup function.
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
