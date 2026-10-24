import { getScope, getYapmod } from "./scope";
import { invokeCommand } from "./tauri";

/**
 * The options the host app passes to a notification.
 */
type NotificationOptions = {
  body?: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
};

/**
 * The state of the permission to show notifications.
 */
type PermissionState = "granted" | "denied" | "default";

/**
 * The event the shell sends when the user clicks a notification.
 */
const CLICK_EVENT = "yapmod:notification-click";

/**
 * The handlers of the notifications the user clicked, by tag.
 */
const handlers = new Map<string, () => void>();

/**
 * The permission the host app sees.
 */
let permission: PermissionState = "denied";

/**
 * Tells whether the user wants notifications.
 */
function wanted(): boolean {
  return getYapmod().store?.get<boolean>("notifications", true) !== false;
}

/**
 * Brings the permission in line with the setting of the user.
 */
function sync(): void {
  permission = wanted() ? "granted" : "denied";
}

/**
 * A notification that goes to the notification center of the system.
 *
 * The webview has no notification center of its own, so the notification is
 * handed over to the shell, which shows it with the system.
 */
class YapmodNotification {
  /**
   * The permission the host app asks for before it shows a notification.
   */
  static get permission(): PermissionState {
    return permission;
  }

  /**
   * Asks the system for the permission to show notifications.
   */
  static async requestPermission(): Promise<PermissionState> {
    if (!wanted()) {
      permission = "denied";

      return permission;
    }

    try {
      await invokeCommand<string>("request_notification_permission");
    } catch (error: unknown) {
      console.error(
        "[yapmod] could not ask for the notification permission",
        error,
      );
    }

    permission = "granted";

    return permission;
  }

  /**
   * The tag of the notification, which tells the messages apart.
   */
  readonly tag: string;

  /**
   * The handler that runs when the user clicks the notification.
   */
  private handler: (() => void) | null = null;

  constructor(title: string, options: NotificationOptions = {}) {
    this.tag = options.tag ?? title;

    void invokeCommand<void>("notify", {
      title,
      body: options.body ?? "",
      tag: this.tag,
      silent: options.silent ?? false,
    }).catch((error: unknown) => {
      console.error("[yapmod] could not show the notification", error);
    });
  }

  get onclick(): (() => void) | null {
    return this.handler;
  }

  set onclick(handler: (() => void) | null) {
    this.handler = handler;

    if (this.tag) {
      handlers.set(this.tag, () => handler?.());
    }
  }

  /**
   * Takes the notification off the screen.
   */
  close(): void {
    handlers.delete(this.tag);
  }
}

/**
 * Asks the system for the permission to show notifications.
 *
 * The shell asks for it, so the user only sees the prompt of the system once.
 */
export function requestNotificationPermission(): Promise<PermissionState> {
  return YapmodNotification.requestPermission();
}

/**
 * Hands the click on a notification back to the host app.
 */
function onClick(event: Event): void {
  const tag = (event as CustomEvent<string>).detail;
  const handler = handlers.get(tag);

  if (!handler) {
    return;
  }

  handlers.delete(tag);
  handler();
}

/**
 * Installs the notification API the host app talks to.
 *
 * The webview cannot show notifications by itself, so the shell does it.
 */
export function installNotificationApi(): void {
  sync();

  getYapmod().store?.onChange("notifications", () => {
    sync();
  });

  window.addEventListener(CLICK_EVENT, onClick);

  const scope = getScope() as unknown as { Notification: unknown };

  scope.Notification = YapmodNotification;
}
