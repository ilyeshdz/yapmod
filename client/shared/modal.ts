import type {
  ModalButton,
  ModalCloseReason,
  ModalContent,
  ModalOptions,
  ModalSize,
  YapmodModal,
  YapmodModalApi,
} from "./types";
import { createElement, ensureStyle } from "./ui";
import { getYapmod } from "./scope";

const MODAL_STYLE_ID = "yapmod-modal-styles";
const SCROLL_LOCK_CLASS = "yapmod-modal-open";

const MODAL_CSS = `
.yapmod-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overscroll-behavior: contain;
}
.yapmod-modal-overlay[hidden] {
  display: none !important;
}
.yapmod-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100%, 440px);
  max-height: min(86vh, 900px);
  margin: 0;
}
.yapmod-modal--sm { width: min(100%, 360px); }
.yapmod-modal--md { width: min(100%, 440px); }
.yapmod-modal--lg { width: min(100%, 640px); }
.yapmod-modal--xl { width: min(100%, 840px); }
.yapmod-modal-head {
  padding-right: 44px;
}
.yapmod-modal-body {
  min-height: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.yapmod-modal-body:empty {
  display: none;
}
.yapmod-modal-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--ym-border, var(--border, rgba(255, 255, 255, 0.08)));
}
.yapmod-modal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  opacity: 0.65;
  cursor: pointer;
}
.yapmod-modal-close:hover,
.yapmod-modal-close:focus-visible {
  background: var(--ym-bg-elev, var(--bg-elev, rgba(255, 255, 255, 0.08)));
  opacity: 1;
}
.yapmod-modal-danger {
  border-color: transparent !important;
  background: var(--ym-danger, var(--danger, #d9485f)) !important;
  color: var(--ym-on-accent, var(--on-accent, #fff)) !important;
}
.yapmod-modal-danger:hover {
  background: color-mix(in srgb, var(--ym-danger, var(--danger, #d9485f)) 88%, #000) !important;
}
.yapmod-modal-primary {
  border-color: transparent !important;
  background: var(--ym-accent, var(--tint-a, #5865f2)) !important;
  color: var(--ym-on-accent, var(--on-accent, #fff)) !important;
}
html.${SCROLL_LOCK_CLASS},
html.${SCROLL_LOCK_CLASS} body {
  overflow: hidden !important;
}
@media (max-width: 520px) {
  .yapmod-modal,
  .yapmod-modal--sm,
  .yapmod-modal--md,
  .yapmod-modal--lg,
  .yapmod-modal--xl {
    width: 100%;
    max-height: 90vh;
  }
  .yapmod-modal-foot .btn {
    flex: 1 1 auto;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .yapmod-modal {
    animation: yapmod-modal-pop 140ms ease-out;
  }
  @keyframes yapmod-modal-pop {
    from { opacity: 0; transform: translateY(6px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }
}
`;

let modalSequence = 0;
const activeModals: YapmodModalImpl[] = [];

function nextModalId(): string {
  modalSequence += 1;
  return `yapmod-modal-${modalSequence}`;
}

function ensureModalStyles(): void {
  ensureStyle(MODAL_STYLE_ID, MODAL_CSS);
}

function htmlToNode(html: string): Node {
  const template = createElement("template", { html });
  return template.content;
}

function syncScrollLock(): void {
  const shouldLock = activeModals.some(
    (modal) => modal.shouldLockScroll,
  );
  document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, shouldLock);
}

class YapmodModalImpl implements YapmodModal {
  readonly id: string;
  readonly element: HTMLElement;
  readonly dialog: HTMLElement;
  readonly body: HTMLElement;
  readonly closed: Promise<ModalCloseReason>;

  private readonly options: ModalOptions;
  private readonly dismissible: boolean;
  private readonly closeOnBackdrop: boolean;
  private readonly closeOnEscape: boolean;
  private readonly autoFocus: boolean;
  private hasAutofocusButton = false;
  private previousFocus: HTMLElement | null = null;

  private headElement: HTMLElement | null = null;
  private titleElement: HTMLHeadingElement | null = null;
  private descriptionElement: HTMLParagraphElement | null = null;
  private footerElement: HTMLElement | null = null;

  private openState = false;
  private mounted = false;
  private destroyed = false;
  private pendingMount = false;
  private closedResolve: ((reason: ModalCloseReason) => void) | null = null;

  constructor(options: ModalOptions = {}) {
    this.options = options;
    this.id = options.id ?? nextModalId();
    this.dismissible = options.dismissible !== false;
    this.closeOnBackdrop = options.closeOnBackdrop ?? this.dismissible;
    this.closeOnEscape = options.closeOnEscape ?? this.dismissible;
    this.autoFocus = options.autoFocus === true;

    this.closed = new Promise((resolve) => {
      this.closedResolve = resolve;
    });

    this.element = createElement("div", {
      className: "overlay yapmod-modal-overlay",
      dataset: { yapmodModal: this.id },
      props: { hidden: true },
    });

    this.dialog = createElement("div", {
      className: [
        "modal",
        "yapmod-modal",
        `yapmod-modal--${options.size ?? "md"}`,
        options.className ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      dataset: { yapmodModalDialog: "" },
      attrs: { role: "dialog", "aria-modal": "true" },
      props: { tabIndex: -1 },
    });

    this.body = createElement("div", {
      className: "modal-body yapmod-modal-body",
    });

    if (this.dismissible) {
      this.dialog.appendChild(this.createCloseButton());
    }

    this.dialog.appendChild(this.body);

    this.setTitle(options.title ?? null);
    this.setDescription(options.description ?? null);
    this.setContent(
      options.html != null ? htmlToNode(options.html) : options.content,
    );

    for (const button of options.buttons ?? []) {
      this.addButton(button);
    }

    this.element.appendChild(this.dialog);
    this.element.addEventListener("click", this.handleBackdropClick);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  get head(): HTMLElement | null {
    return this.headElement;
  }

  get footer(): HTMLElement | null {
    return this.footerElement;
  }

  get shouldLockScroll(): boolean {
    return this.options.lockScroll !== false;
  }

  open(): this {
    if (this.destroyed) {
      throw new Error("yapmod: cannot open a destroyed modal");
    }

    if (this.openState) {
      return this;
    }

    this.openState = true;

    // The focus is left where it is unless the modal explicitly asks for it.
    this.previousFocus = this.shouldFocus()
      ? document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      : null;

    this.element.hidden = false;
    this.mount();
    activeModals.push(this);

    document.addEventListener("keydown", this.handleDocumentKeyDown, true);
    syncScrollLock();

    if (this.mounted) {
      this.focusInitial();
    }

    this.invoke(this.options.onOpen, this);

    return this;
  }

  close(reason: ModalCloseReason = "api"): void {
    if (!this.openState) {
      return;
    }

    this.openState = false;

    const index = activeModals.indexOf(this);
    if (index !== -1) {
      activeModals.splice(index, 1);
    }

    document.removeEventListener("keydown", this.handleDocumentKeyDown, true);
    this.element.hidden = true;

    if (this.pendingMount) {
      document.removeEventListener("DOMContentLoaded", this.handleDomReady);
      this.pendingMount = false;
    }

    if (this.mounted) {
      this.element.remove();
      this.mounted = false;
    }

    syncScrollLock();
    this.restoreFocus();
    this.invoke(this.options.onClose, this, reason);
    this.settle(reason);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    if (this.openState) {
      this.close("destroy");
    } else {
      this.settle("destroy");
    }

    this.destroyed = true;
  }

  setTitle(title: string | null): void {
    const value = title?.trim() ? title : null;

    if (!value) {
      this.titleElement?.remove();
      this.titleElement = null;
      this.cleanupHead();
      this.updateAria();
      return;
    }

    const head = this.ensureHead();

    if (!this.titleElement) {
      const element = createElement("h2", {
        attrs: { id: `${this.id}-title` },
      });
      head.insertBefore(element, head.firstChild);
      this.titleElement = element;
    }

    this.titleElement.textContent = value;
    this.updateAria();
  }

  setDescription(description: string | null): void {
    const value = description?.trim() ? description : null;

    if (!value) {
      this.descriptionElement?.remove();
      this.descriptionElement = null;
      this.cleanupHead();
      this.updateAria();
      return;
    }

    const head = this.ensureHead();

    if (!this.descriptionElement) {
      const element = createElement("p", {
        attrs: { id: `${this.id}-description` },
      });
      head.appendChild(element);
      this.descriptionElement = element;
    }

    this.descriptionElement.textContent = value;
    this.updateAria();
  }

  setContent(content?: ModalContent): void {
    this.body.replaceChildren();

    if (content == null) {
      return;
    }

    const value = typeof content === "function" ? content(this) : content;

    if (value == null || value === "") {
      return;
    }

    this.body.appendChild(
      typeof value === "string" ? document.createTextNode(value) : value,
    );
  }

  addButton(button: ModalButton): HTMLButtonElement {
    const element = createElement("button", {
      className: [
        "btn",
        button.variant === "secondary" ? "secondary" : "",
        button.variant === "danger" ? "yapmod-modal-danger" : "",
        // "native" keeps the styles of the host app, without our own tint.
        button.variant === "primary" || !button.variant
          ? "yapmod-modal-primary"
          : "",
        button.className ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      text: button.label,
      props: {
        type: "button",
        disabled: button.disabled === true,
      },
      dataset: button.autofocus ? { yapmodAutofocus: "" } : undefined,
      on: {
        click: (event) => {
          const target = event.currentTarget as HTMLButtonElement;

          if (target.disabled) {
            return;
          }

          const result = button.onClick?.(this);
          const closeOnClick = button.closeOnClick !== false;

          if (result instanceof Promise) {
            target.disabled = true;

            result
              .then((value) => {
                target.disabled = false;

                if (closeOnClick && value !== false) {
                  this.close("button");
                }
              })
              .catch((error: unknown) => {
                target.disabled = false;
                console.error("[yapmod] modal button handler failed", error);
              });

            return;
          }

          if (closeOnClick && result !== false) {
            this.close("button");
          }
        },
      },
    });

    if (button.autofocus) {
      this.hasAutofocusButton = true;
    }

    this.ensureFooter().appendChild(element);

    return element;
  }

  private createCloseButton(): HTMLButtonElement {
    return createElement("button", {
      className: "yapmod-modal-close",
      text: "\u00d7",
      attrs: { "aria-label": "Close dialog" },
      props: { type: "button" },
      on: {
        click: () => this.close("dismiss"),
      },
    });
  }

  private ensureHead(): HTMLElement {
    if (!this.headElement) {
      const head = createElement("div", {
        className: "modal-head yapmod-modal-head",
      });
      this.dialog.insertBefore(head, this.body);
      this.headElement = head;
    }

    return this.headElement;
  }

  private cleanupHead(): void {
    if (this.headElement && !this.titleElement && !this.descriptionElement) {
      this.headElement.remove();
      this.headElement = null;
    }
  }

  private ensureFooter(): HTMLElement {
    if (!this.footerElement) {
      const footer = createElement("div", {
        className: "modal-foot yapmod-modal-foot",
      });
      this.dialog.appendChild(footer);
      this.footerElement = footer;
    }

    return this.footerElement;
  }

  private updateAria(): void {
    if (this.titleElement) {
      this.dialog.setAttribute("aria-labelledby", `${this.id}-title`);
      this.dialog.removeAttribute("aria-label");
    } else {
      this.dialog.removeAttribute("aria-labelledby");
      this.dialog.setAttribute(
        "aria-label",
        this.options.ariaLabel ?? "Yapmod dialog",
      );
    }

    if (this.descriptionElement) {
      this.dialog.setAttribute(
        "aria-describedby",
        `${this.id}-description`,
      );
    } else {
      this.dialog.removeAttribute("aria-describedby");
    }
  }

  private mount(): void {
    if (this.mounted) {
      return;
    }

    if (!document.body) {
      if (!this.pendingMount) {
        this.pendingMount = true;
        document.addEventListener(
          "DOMContentLoaded",
          this.handleDomReady,
          { once: true },
        );
      }

      return;
    }

    ensureModalStyles();
    document.body.appendChild(this.element);
    this.mounted = true;
  }

  private focusInitial(): void {
    if (!this.mounted || !this.shouldFocus()) {
      return;
    }

    const preferred = this.dialog.querySelector<HTMLElement>(
      "[autofocus], [data-yapmod-autofocus]",
    );
    (preferred ?? this.dialog).focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    const previous = this.previousFocus;

    if (previous?.isConnected) {
      previous.focus({ preventScroll: true });
      return;
    }

    activeModals[activeModals.length - 1]?.focusInitial();
  }

  private getFocusable(): HTMLElement[] {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    return Array.from(
      this.dialog.querySelectorAll<HTMLElement>(selector),
    ).filter((element) => element.getClientRects().length > 0);
  }

  private shouldFocus(): boolean {
    return this.autoFocus || this.hasAutofocusButton;
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = this.getFocusable();

    if (focusable.length === 0) {
      event.preventDefault();
      this.dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || active === this.dialog) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
      return;
    }

    if (active === last || !this.dialog.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  private invoke<T extends unknown[]>(
    callback: ((...args: T) => void) | undefined,
    ...args: T
  ): void {
    if (!callback) {
      return;
    }

    try {
      callback(...args);
    } catch (error) {
      console.error("[yapmod] modal callback failed", error);
    }
  }

  private settle(reason: ModalCloseReason): void {
    const resolve = this.closedResolve;

    if (!resolve) {
      return;
    }

    this.closedResolve = null;
    resolve(reason);
  }

  private handleDomReady = (): void => {
    this.pendingMount = false;

    if (!this.openState) {
      return;
    }

    this.mount();
    this.focusInitial();
  };

  private handleBackdropClick = (event: MouseEvent): void => {
    if (event.target !== this.element || !this.closeOnBackdrop) {
      return;
    }

    this.close("backdrop");
  };

  private handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (activeModals[activeModals.length - 1] !== this) {
      return;
    }

    if (event.key === "Escape" && this.closeOnEscape) {
      event.preventDefault();
      event.stopPropagation();
      this.close("escape");
      return;
    }

    if (event.key === "Tab" && this.shouldFocus()) {
      this.trapFocus(event);
    }
  };
}

const modalApi: YapmodModalApi = {
  create(options: ModalOptions = {}): YapmodModal {
    return new YapmodModalImpl(options);
  },

  show(options: ModalOptions = {}): YapmodModal {
    return new YapmodModalImpl(options).open();
  },

  closeAll(reason: ModalCloseReason = "api"): void {
    for (const modal of [...activeModals]) {
      modal.close(reason);
    }
  },

  get active(): YapmodModal[] {
    return [...activeModals];
  },
};

export { modalApi };

export function installModalApi(): void {
  getYapmod().modal = modalApi;
}
