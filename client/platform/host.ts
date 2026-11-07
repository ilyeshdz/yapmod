import type {
  ClientUpdateInfo,
  ClientUpdateLaunchStatus,
  CommunityPlugin,
  PluginBundle,
  PluginManifest,
  ReleaseEntry,
  UpdateInfo,
} from "../shared/types";
import type { CommunityTheme, ThemeBundle } from "../features/themes/types";

/**
 * The environment services the client needs.
 *
 * The client itself is environment-agnostic. A target (desktop, web, …)
 * provides an implementation of these ports and installs it before any
 * feature is composed. Feature code never asks which environment it runs in;
 * it asks the port.
 */

export type NotificationPermission = "granted" | "denied" | "default";

export type NotificationOptions = {
  body?: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
};

export type HostCapabilities = {
  /** The host can minimize, maximize and close its window. */
  windowControls: boolean;
  /** The host can show system or extension notifications. */
  notifications: boolean;
  /** The host can put an unread count on a dock, taskbar or toolbar icon. */
  badge: boolean;
  /**
   * How packages are installed. `filesystem` means the host owns folders and
   * native pickers; `extension-storage` means packages are data in extension
   * storage; `none` means only bundled packages are available.
   */
  packages: "filesystem" | "extension-storage" | "none";
  /** How the host updates itself and the client. */
  updates: "app-and-client" | "client" | "extension" | "none";
  /** The host can provide release notes. */
  releaseNotes: boolean;
  /** The client runs in the page's JavaScript realm. */
  pageRealm: boolean;
};

export type SettingsPort = {
  /** Persist a batch of settings owned by the client. */
  save(values: Record<string, unknown>): Promise<void>;
};

export type ExternalLinkPort = {
  /** Open a URL outside the client. */
  open(url: string): Promise<void>;
};

export type NotificationPort = {
  /** Ask for permission, returning the state the client should expose. */
  request(): Promise<NotificationPermission>;
  /** Show a notification. */
  show(title: string, options: NotificationOptions): Promise<void>;
  /** Subscribe to notification clicks by tag. Returns a cleanup function. */
  onClick(listener: (tag: string) => void): () => void;
};

export type WindowPort = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
};

export type BadgePort = {
  set(count: number | null): Promise<void>;
};

export type TransparencyStatus = {
  /** The host can apply a native window effect. */
  supported: boolean;
  /** The effect that is active, for example `mica` or `vibrancy`. */
  effect: string | null;
  /** Whether an effect is currently applied. */
  applied: boolean;
};

export type AppearancePort = {
  /**
   * Apply or clear the native window transparency effect.
   *
   * `dark` selects the system tint where the platform supports it. `undefined`
   * follows the operating system preference.
   */
  setTransparency(enabled: boolean, dark?: boolean): Promise<TransparencyStatus>;
};

export type ThemeRepository = {
  list(): Promise<ThemeBundle[]>;
  listCommunity(): Promise<CommunityTheme[]>;
  pickFolder(): Promise<string | null>;
  install(source: string): Promise<ThemeBundle>;
  installCommunity(id: string): Promise<ThemeBundle>;
  reload(id: string): Promise<ThemeBundle>;
  remove(id: string): Promise<void>;
  folder(): Promise<string>;
  openFolder(): Promise<void>;
};

export type PluginRepository = {
  list(): Promise<PluginBundle[]>;
  listCommunity(): Promise<CommunityPlugin[]>;
  previewCommunity(id: string): Promise<PluginManifest>;
  installCommunity(id: string, expectedManifest: PluginManifest): Promise<PluginBundle>;
  pickFolder(): Promise<PluginManifest | null>;
  installPicked(expectedManifest: PluginManifest): Promise<PluginBundle>;
  pickFile(accept: string | null | undefined): Promise<string | null>;
  reload(id: string): Promise<PluginBundle>;
  remove(id: string): Promise<void>;
  openFolder(): Promise<void>;
};

export type UpdatePort = {
  launchStatus(): Promise<ClientUpdateLaunchStatus>;
  confirmClientUpdate(): Promise<void>;
  prepareClientUpdate(currentVersion: string): Promise<ClientUpdateInfo | null>;
  check(): Promise<UpdateInfo | null>;
  installAppUpdate?(): Promise<void>;
  restart(): Promise<void>;
};

export type ReleasePort = {
  changelog(): Promise<ReleaseEntry[]>;
};

export type YapmodHost = {
  readonly id: "desktop" | "web";
  /** Version of the client bundle or extension that hosts this client. */
  readonly version: string;
  /** The platform in the shape the wrapped app expects. */
  readonly platform: string;
  /** The host the wrapped app considers internal. */
  readonly internalHost: string;
  readonly capabilities: HostCapabilities;

  readonly settings: SettingsPort;

  /** Optional because a bundle may not expose these capabilities at all. */
  readonly links?: ExternalLinkPort;
  readonly notifications?: NotificationPort;
  readonly window?: WindowPort;
  readonly badge?: BadgePort;
  readonly appearance?: AppearancePort;
  readonly themes?: ThemeRepository;
  readonly plugins?: PluginRepository;
  readonly updates?: UpdatePort;
  readonly release?: ReleasePort;

  /**
   * The desktop-only escape hatch used by plugin `api.invoke`. Buckets such as
   * the Web extension must leave this out so plugins cannot reach host APIs
   * that were not designed for them.
   */
  invoke?(command: string, args?: Record<string, unknown>): Promise<unknown>;
};

let installedHost: YapmodHost | null = null;

/** Installs the host for this bundle. Called once by the target entry point. */
export function installHost(host: YapmodHost): void {
  installedHost = host;
}

/** The host installed by the current bundle. */
export function getHost(): YapmodHost {
  if (!installedHost) {
    throw new Error("[yapmod] the client host was not installed");
  }

  return installedHost;
}
