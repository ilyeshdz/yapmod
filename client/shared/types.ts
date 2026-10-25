import type {
  Config,
  Payload,
  ReleaseEntry,
  ReleaseInfo,
  ReleaseNotes,
  ReleaseNotesSection,
  UpdateInfo,
} from "../generated/types";
import type { DesktopBridge } from "../core/desktop";
import type { YapmodBannerApi } from "../features/banners/api";
import type { YapmodThemeApi } from "../features/themes/engine";

export type {
  Config,
  Payload,
  ReleaseEntry,
  ReleaseInfo,
  ReleaseNotes,
  ReleaseNotesSection,
  UpdateInfo,
};

export type ClientUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
};

export type ClientUpdateLaunchStatus = {
  trial: boolean;
  rolledBack: boolean;
};

export type ModalSize = "sm" | "md" | "lg" | "xl";

export type ModalCloseReason =
  | "api"
  | "backdrop"
  | "escape"
  | "button"
  | "dismiss"
  | "destroy";

export type ModalContent =
  | string
  | Node
  | null
  | ((modal: YapmodModal) => string | Node | null);

export type ModalButton = {
  label: string;
  /**
   * "native" keeps the button exactly as the host app styles it.
   */
  variant?: "primary" | "secondary" | "danger" | "native";
  className?: string;
  disabled?: boolean;
  autofocus?: boolean;
  onClick?: (
    modal: YapmodModal,
  ) => void | boolean | Promise<void | boolean>;
  closeOnClick?: boolean;
};

export type ModalOptions = {
  id?: string;
  title?: string | null;
  description?: string | null;
  content?: ModalContent;
  html?: string;
  buttons?: ModalButton[];
  size?: ModalSize;
  className?: string;
  ariaLabel?: string;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  /**
   * Moves the keyboard focus into the dialog when it opens.
   *
   * Off by default, so a modal never steals the focus from the page. A button
   * marked with `autofocus` still opts in to being focused.
   */
  autoFocus?: boolean;
  onOpen?: (modal: YapmodModal) => void;
  onClose?: (modal: YapmodModal, reason: ModalCloseReason) => void;
};

export interface YapmodModal {
  readonly id: string;
  readonly element: HTMLElement;
  readonly dialog: HTMLElement;
  readonly head: HTMLElement | null;
  readonly body: HTMLElement;
  readonly footer: HTMLElement | null;
  readonly isOpen: boolean;
  readonly closed: Promise<ModalCloseReason>;
  open(): this;
  close(reason?: ModalCloseReason): void;
  destroy(): void;
  setTitle(title: string | null): void;
  setDescription(description: string | null): void;
  setContent(content?: ModalContent): void;
  addButton(button: ModalButton): HTMLButtonElement;
}

export type YapmodModalApi = {
  create(options?: ModalOptions): YapmodModal;
  show(options?: ModalOptions): YapmodModal;
  closeAll(reason?: ModalCloseReason): void;
  readonly active: YapmodModal[];
};

export type SettingsContext = {
  readonly id: string;
  refresh(): void;
};

export type SettingOption = {
  value: string;
  label: string;
};

export type SettingsItem =
  | {
      type: "toggle";
      id: string;
      label: string;
      description?: string;
      value: boolean;
      disabled?: boolean;
      onChange: (value: boolean) => void;
    }
  | {
      type: "select";
      id: string;
      label: string;
      description?: string;
      value: string;
      options: SettingOption[];
      disabled?: boolean;
      onChange: (value: string) => void;
    }
  | {
      type: "text";
      id: string;
      label: string;
      description?: string;
      value: string;
      placeholder?: string;
      maxLength?: number;
      disabled?: boolean;
      onChange: (value: string) => void;
    }
  | {
      type: "number";
      id: string;
      label: string;
      description?: string;
      value: number;
      min?: number;
      max?: number;
      step?: number;
      disabled?: boolean;
      onChange: (value: number) => void;
    }
  | {
      type: "button";
      id: string;
      label: string;
      variant?: "primary" | "secondary" | "danger";
      onClick: () => void;
    }
  | {
      type: "custom";
      id: string;
      label?: string;
      description?: string;
      render: (
        host: HTMLElement,
        context: SettingsContext,
      ) => void | (() => void);
    };

export type SettingsSection = {
  id: string;
  label: string;
  icon?: "monitor" | "palette" | "history" | "puzzle";
  group?: string;
  order?: number;
  description?: string;
  items?: SettingsItem[];
  render?: (
    host: HTMLElement,
    context: SettingsContext,
  ) => void | (() => void);
  onShow?: () => void;
  onHide?: () => void;
};

export type YapmodSettingsApi = {
  register(section: SettingsSection): () => void;
  unregister(id: string): void;
  open(id: string): void;
  refresh(id?: string): void;
  readonly sections: readonly SettingsSection[];
  readonly active: string | null;
};

export type YapmodStoreApi = {
  get<T = unknown>(key: string, fallback?: T): T;
  set(key: string, value: unknown): void;
  all(): Record<string, unknown>;
  onChange(key: string, listener: (value: unknown) => void): () => void;
  flush(): Promise<void>;
};

/** Metadata supplied by an installed plugin package. */
export type PluginManifest = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  license?: string;
  tags?: string[];
  /** The plugin format this package targets. Version 1 supports CSS and optional DOM scripts. */
  api: 1;
  settings: PluginSetting[];
  stylesheet: string;
  script?: string;
};

export type PluginSetting = {
  id: string;
  label: string;
  description?: string;
  type: "toggle";
  default: boolean;
};

export type PluginBundle = {
  manifest: PluginManifest;
  css: string;
  script: string | null;
};

export type PluginCleanup = () => void | Promise<void>;

export type PluginActivation = void | PluginCleanup | Promise<void | PluginCleanup>;

export type YapmodPluginApi = {
  readonly id: string;
  readonly manifest: Readonly<PluginManifest>;
  readonly storage: {
    get<T>(key: string, fallback?: T): T;
    set(key: string, value: unknown): void;
  };
  readonly settings: {
    get(id: string): boolean;
    onChange(id: string, listener: (value: boolean) => void): () => void;
  };
  readonly styles: {
    add(css: string): PluginCleanup;
  };
  readonly webSocket: WebSocketInspector;
  readonly http: HTTPInspector;
  banner(message: string): void;
};

export type YapmodPluginModule = {
  activate(api: YapmodPluginApi): PluginActivation;
};

export type PluginDiagnostic = {
  operation: "load" | "activate" | "deactivate" | "cleanup";
  message: string;
  at: string;
};

export type CommunityPlugin = PluginManifest & { tags: string[] };

export type YapmodPluginsApi = {
  list(): YapmodPluginInfo[];
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  onChange(listener: () => void): () => void;
  importLocal(): Promise<PluginManifest | null>;
  listCommunity(): Promise<CommunityPlugin[]>;
  installCommunity(id: string): Promise<PluginManifest>;
  remove(id: string): Promise<void>;
  refreshInstalled(): Promise<void>;
  openFolder(): Promise<void>;
};

export type YapmodPluginInfo = {
  manifest: PluginManifest;
  source: "installed";
  enabled: boolean;
  busy: boolean;
  error: string | null;
  diagnostic: PluginDiagnostic | null;
};

/**
 * A single observed WebSocket message with basic connection metadata.
 *
 * The `data` field is an immutable snapshot of the message payload at the time
 * it was observed. For binary payloads (ArrayBuffer, ArrayBufferView), the data
 * is copied so that mutating the original send argument does not corrupt the
 * inspector's history. For Blob payloads, the data is represented as a
 * `BlobSnapshot` since Blobs cannot be read synchronously.
 *
 * Consumers should treat `data` as read-only.
 */
export type WebSocketMessage = {
  /** The URL the WebSocket was created with. */
  url: string;
  /**
   * The message payload, captured as an immutable snapshot.
   * - Strings remain strings.
   * - ArrayBuffer and ArrayBufferView payloads are copied into a new ArrayBuffer.
   * - Blob payloads are represented as a BlobSnapshot (cannot be read synchronously).
   */
  data: string | ArrayBuffer | BlobSnapshot;
  /** When the message was observed (epoch ms). */
  timestamp: number;
};

/**
 * Represents a Blob payload that could not be read synchronously.
 * Since reading a Blob requires an asynchronous API, the inspector stores
 * a snapshot describing the blob's metadata instead of its contents.
 */
export type BlobSnapshot = {
  /** Identifies this as a Blob snapshot. */
  __blob: true;
  /** The Blob's reported type (MIME type), if available. */
  type: string;
  /** The Blob's reported size in bytes. */
  size: number;
};

/** Callback invoked when a new WebSocket message is observed. */
export type WebSocketMessageHandler = (message: WebSocketMessage) => void;

/**
 * Interceptor for outgoing WebSocket messages.
 * Receives the message data and connection metadata, and may return a
 * replacement payload to send instead.
 *
 * Interceptors run synchronously in registration order before the original
 * `send()` call. Each interceptor receives the latest payload produced by
 * the previous interceptor.
 *
 * - Returning `undefined` (void) means no change — the current payload is kept.
 * - Returning a valid WebSocket payload (`string`, `ArrayBuffer`,
 *   `ArrayBufferView`, or `Blob`) replaces the current payload.
 * - If an interceptor throws, all modifications from the entire interception
 *   chain are discarded and the original payload is sent unchanged.
 * - If an interceptor returns an invalid type, it is treated as a failure:
 *   the entire chain is discarded and the original payload is sent.
 *
 * Message delivery is never suppressed by an interceptor.
 */
export type WebSocketOutgoingInterceptor = (
  message: WebSocketMessage,
) => string | ArrayBuffer | ArrayBufferView | Blob | void;

/**
 * A single observed HTTP exchange with request and response metadata.
 *
 * The `requestBody` and `responseBody` fields are immutable snapshots captured
 * at the time of observation. For binary payloads (ArrayBuffer, ArrayBufferView),
 * the data is copied so that mutating the original argument does not corrupt the
 * inspector's history. For Blob payloads, the data is represented as a
 * `BlobSnapshot` since Blobs cannot be read synchronously.
 *
 * Consumers should treat body fields as read-only.
 */
export type HTTPMessage = {
  /** The request URL. */
  url: string;
  /** HTTP method (GET, POST, etc.). */
  method: string;
  /** Request headers as an ordered array of [name, value] pairs. */
  requestHeaders: [string, string][];
  /** Request body, captured as an immutable snapshot (undefined for no-body methods). */
  requestBody?: string | ArrayBuffer | BlobSnapshot;
  /** Response status code (e.g. 200, 404). */
  status: number;
  /** Response status text (e.g. "OK", "Not Found"). */
  statusText: string;
  /** Response headers as an ordered array of [name, value] pairs. */
  responseHeaders: [string, string][];
  /** Response body, captured as an immutable snapshot. */
  responseBody?: string | ArrayBuffer | BlobSnapshot;
  /** When the request was sent (epoch ms). */
  timestamp: number;
  /** Duration of the request in milliseconds. */
  duration: number;
};

/**
 * A single observed outgoing HTTP request (before response is available).
 * Used by the outgoing channel so that subscribers fire immediately when
 * the request is sent, without waiting for the response.
 */
export type HTTPOutgoingMessage = {
  /** The request URL. */
  url: string;
  /** HTTP method (GET, POST, etc.). */
  method: string;
  /** Request headers as an ordered array of [name, value] pairs. */
  requestHeaders: [string, string][];
  /** Request body, captured as an immutable snapshot (undefined for no-body methods). */
  requestBody?: string | ArrayBuffer | BlobSnapshot;
  /** When the request was sent (epoch ms). */
  timestamp: number;
};

/** Callback invoked when a new HTTP exchange is observed. */
export type HTTPMessageHandler = (message: HTTPMessage) => void;

/** Callback invoked when a new outgoing HTTP request is observed. */
export type HTTPOutgoingMessageHandler = (message: HTTPOutgoingMessage) => void;

/**
 * Interceptor for outgoing HTTP requests.
 * Receives the request metadata and may return a modified `RequestInit` object
 * to replace the original request configuration.
 *
 * Interceptors run synchronously in registration order before the original
 * `fetch()` call. Each interceptor receives the latest configuration produced
 * by the previous interceptor.
 *
 * - Returning `undefined` (void) means no change — the current configuration is kept.
 * - Returning a `RequestInit`-compatible object replaces the current configuration.
 * - If an interceptor throws, all modifications from the entire interception
 *   chain are discarded and the original request is sent unchanged.
 *
 * Message delivery is never suppressed by an interceptor.
 */
export type HTTPOutgoingInterceptor = (
  message: HTTPOutgoingMessage,
) => RequestInit | void;

/**
 * Inspects HTTP requests flowing through the application via `fetch()`.
 * Provides access to observed incoming (response) and outgoing (request) messages.
 * Outgoing requests can be modified before transmission using interceptors.
 */
export type HTTPInspector = {
  /**
   * Complete HTTP exchanges (request + response).
   * This channel fires after the response is received.
   */
  exchanges: {
    /** Returns a snapshot of all observed HTTP exchanges. */
    messages(): HTTPMessage[];
    /** Subscribes to HTTP exchanges; returns a cleanup function to unsubscribe. */
    subscribe(handler: HTTPMessageHandler): () => void;
  };
  /** Outgoing HTTP requests (fires immediately when the request is sent). */
  outgoing: {
    /** Returns a snapshot of all observed outgoing requests. */
    messages(): HTTPOutgoingMessage[];
    /** Subscribes to outgoing requests; returns a cleanup function to unsubscribe. */
    subscribe(handler: HTTPOutgoingMessageHandler): () => void;
    /**
     * Registers an interceptor that runs synchronously before each outgoing
     * HTTP request is sent. Interceptors execute in registration order.
     *
     * If an interceptor returns a value, it replaces the request configuration.
     * If it returns void (undefined), the request passes through unchanged.
     * If an interceptor throws, the original request is sent and the error is logged.
     *
     * Returns a cleanup function to remove the interceptor.
     */
    use(interceptor: HTTPOutgoingInterceptor): () => void;
  };
};

/**
 * Inspects WebSocket messages flowing through the application.
 * Provides access to observed incoming and outgoing messages.
 * Outgoing messages can be modified before transmission using interceptors.
 */
export type WebSocketInspector = {
  /** Messages received by the application from a WebSocket server. */
  incoming: {
    /** Returns a snapshot of all observed incoming messages. */
    messages(): WebSocketMessage[];
    /** Subscribes to incoming messages; returns a cleanup function to unsubscribe. */
    subscribe(handler: WebSocketMessageHandler): () => void;
  };
  /** Messages sent by the application through a WebSocket connection. */
  outgoing: {
    /** Returns a snapshot of all observed outgoing messages. */
    messages(): WebSocketMessage[];
    /** Subscribes to outgoing messages; returns a cleanup function to unsubscribe. */
    subscribe(handler: WebSocketMessageHandler): () => void;
    /**
     * Registers an interceptor that runs synchronously before each outgoing
     * WebSocket message is sent. Interceptors execute in registration order.
     *
     * If an interceptor returns a value, it replaces the message payload.
     * If it returns void (undefined), the message passes through unchanged.
     * If an interceptor throws, the original payload is sent and the error is logged.
     *
     * Returns a cleanup function to remove the interceptor.
     */
    use(interceptor: WebSocketOutgoingInterceptor): () => void;
  };
};

export type YapmodGlobal = {
  config?: Config;
  os?: string;
  internalHost?: string;
  /** Version of the injected client bundle, independent from the desktop app. */
  clientVersion?: string;
  release?: ReleaseInfo;
  changelog?: () => Promise<ReleaseEntry[]>;
  applyCss?: (css: string) => void;
  banner?: YapmodBannerApi;
  modal?: YapmodModalApi;
  settings?: YapmodSettingsApi;
  plugins?: YapmodPluginsApi;
  store?: YapmodStoreApi;
  theme?: YapmodThemeApi;
  /** Low-level WebSocket inspection layer for plugins. */
  webSocket?: WebSocketInspector;
  /** Low-level HTTP inspection layer for plugins. */
  http?: HTTPInspector;
};

export type YapmodScope = typeof globalThis & {
  __yapmod?: YapmodGlobal;
  __YAPMOD__?: Partial<Payload>;
  /**
   * The bridge the host app uses to talk to the desktop shell.
   */
  yapperDesktop?: DesktopBridge;
};
