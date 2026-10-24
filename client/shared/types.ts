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
};

export type YapmodScope = typeof globalThis & {
  __yapmod?: YapmodGlobal;
  __YAPMOD__?: Partial<Payload>;
  /**
   * The bridge the host app uses to talk to the desktop shell.
   */
  yapperDesktop?: DesktopBridge;
};
