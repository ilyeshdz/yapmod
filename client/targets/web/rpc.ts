/**
 * The bridge between the page-realm client and the isolated extension world.
 *
 * Only a tiny isolated script can use `chrome.storage` and the extension
 * runtime. Everything else runs in the page realm, like the desktop client,
 * and sends privileged operations over this private MessageChannel.
 */

import type { ThemeBundle } from "../../features/themes/types";

export const BRIDGE_CONNECT = "yapmod:bridge-connect";
const RETRY_DELAY_MS = 50;
const MAX_ATTEMPTS = 100;

/** The state the page needs before it can compose the client. */
export type WebBootstrap = {
  /** The injected client version, from `client/version.json`. */
  clientVersion: string;
  /** The extension package version, from the extension manifest. */
  shellVersion: string;
  settings: Record<string, unknown>;
  theme: ThemeBundle | null;
};

export type BridgeRequest = {
  id: number;
  method: string;
  params: unknown;
};

export type BridgeResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type BridgeClient = {
  call<T>(method: string, params?: unknown): Promise<T>;
};

/** The page-realm half of the bridge. Called once before the client starts. */
export function createBridgeClient(): BridgeClient {
  const pending = new Map<
    number,
    {
      request: BridgeRequest;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  // Until the bridge accepts a channel, a request is broadcast over the
  // attempts made so far. Only one channel is ever accepted by the bridge.
  const live = new Set<MessagePort>();
  let active: MessagePort | null = null;
  let attempts = 0;
  let nextId = 0;

  function finish(response: BridgeResponse): void {
    const waiter = pending.get(response.id);

    if (!waiter) {
      return;
    }

    pending.delete(response.id);

    if (response.ok) {
      waiter.resolve(response.result);
    } else {
      waiter.reject(new Error(response.error));
    }
  }

  function send(request: BridgeRequest): void {
    if (active) {
      active.postMessage(request);
      return;
    }

    for (const port of live) {
      port.postMessage(request);
    }
  }

  function connect(): void {
    if (active) {
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      const error = new Error("the extension bridge is not available");

      for (const waiter of pending.values()) {
        waiter.reject(error);
      }
      pending.clear();
      return;
    }

    attempts += 1;

    const channel = new MessageChannel();
    const port = channel.port1;

    live.add(port);
    port.onmessage = (event: MessageEvent<BridgeResponse>) => {
      if (!active) {
        active = port;

        for (const other of live) {
          if (other !== port) {
            other.close();
          }
        }

        live.clear();
      }

      finish(event.data);
    };
    port.start();

    // If an earlier attempt reached the bridge before it was listening, the
    // request may not have been delivered. Repeat every outstanding request
    // on this channel as well; only the accepted channel is processed.
    for (const waiter of pending.values()) {
      port.postMessage(waiter.request);
    }

    // The isolated bridge accepts exactly one connection. Both scripts run at
    // document_start, before any page script can listen to this message.
    window.postMessage({ type: BRIDGE_CONNECT }, "*", [channel.port2]);

    window.setTimeout(connect, RETRY_DELAY_MS);
  }

  connect();

  return {
    call<T>(method: string, params?: unknown): Promise<T> {
      if (attempts >= MAX_ATTEMPTS && !active) {
        return Promise.reject(
          new Error("the extension bridge is not available"),
        );
      }

      const id = nextId++;
      const request: BridgeRequest = { id, method, params };

      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          request,
          resolve: (value) => resolve(value as T),
          reject,
        });

        send(request);
      });
    },
  };
}
