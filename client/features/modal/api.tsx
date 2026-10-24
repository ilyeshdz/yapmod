import { createSignal, JSX } from "solid-js";
import { render } from "solid-js/web";

import type {
  ModalButton,
  ModalCloseReason,
  ModalContent,
  ModalOptions,
  ModalSize,
  YapmodModal,
  YapmodModalApi,
} from "../../shared/types";
import { ensureStyle } from "../../shared/ui";
import { getYapmod } from "../../core/scope";
import modalCSS from "../../styles/modal.css";

const MODAL_STYLE_ID = "yapmod-modal-styles";
const SCROLL_LOCK_CLASS = "yapmod-modal-open";

let modalSequence = 0;
const activeModals: YapmodModalImpl[] = [];

function nextModalId(): string {
  modalSequence += 1;
  return `yapmod-modal-${modalSequence}`;
}

function ensureModalStyles(): void {
  ensureStyle(MODAL_STYLE_ID, modalCSS);
}

function htmlToNode(html: string): Node {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

function syncScrollLock(): void {
  const shouldLock = activeModals.some((modal) => modal.shouldLockScroll);
  document.documentElement.classList.toggle(SCROLL_LOCK_CLASS, shouldLock);
}

function classNames(values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

class YapmodModalImpl implements YapmodModal {
  readonly id: string;
  readonly closed: Promise<ModalCloseReason>;

  private readonly options: ModalOptions;
  private readonly dismissible: boolean;
  private readonly closeOnBackdrop: boolean;
  private readonly closeOnEscape: boolean;
  private readonly autoFocus: boolean;
  private readonly size: ModalSize;

  private readonly openSignal = createSignal(false);
  private readonly titleSignal = createSignal<string | null>(null);
  private readonly descriptionSignal = createSignal<string | null>(null);
  private readonly footerSignal = createSignal(false);

  private elementRef!: HTMLElement;
  private dialogRef!: HTMLElement;
  private bodyRef!: HTMLElement;
  private footerRef: HTMLElement | null = null;

  private readonly buttonRoots: Array<() => void> = [];
  private hasAutofocusButton = false;
  private previousFocus: HTMLElement | null = null;

  private mounted = false;
  private destroyed = false;
  private pendingMount = false;
  private closedResolve: ((reason: ModalCloseReason) => void) | null = null;
  private readonly dispose: () => void;

  constructor(options: ModalOptions = {}) {
    this.options = options;
    this.id = options.id ?? nextModalId();
    this.dismissible = options.dismissible !== false;
    this.closeOnBackdrop = options.closeOnBackdrop ?? this.dismissible;
    this.closeOnEscape = options.closeOnEscape ?? this.dismissible;
    this.autoFocus = options.autoFocus === true;
    this.size = options.size ?? "md";

    this.closed = new Promise((resolve) => {
      this.closedResolve = resolve;
    });

    this.titleSignal[1](options.title?.trim() ? options.title : null);
    this.descriptionSignal[1](
      options.description?.trim() ? options.description : null,
    );

    const host = document.createElement("div");
    this.dispose = render(() => this.render(), host);
    this.elementRef = host.firstElementChild as HTMLElement;
    this.bodyRef.replaceChildren();

    this.setContent(
      options.html != null ? htmlToNode(options.html) : options.content,
    );

    for (const button of options.buttons ?? []) {
      this.addButton(button);
    }
  }

  get element(): HTMLElement {
    return this.elementRef;
  }

  get dialog(): HTMLElement {
    return this.dialogRef;
  }

  get body(): HTMLElement {
    return this.bodyRef;
  }

  get head(): HTMLElement | null {
    return this.titleSignal[0]() || this.descriptionSignal[0]()
      ? this.dialogRef.querySelector<HTMLElement>(":scope > .yapmod-modal-head")
      : null;
  }

  get footer(): HTMLElement | null {
    return this.footerSignal[0]() ? this.footerRef : null;
  }

  get isOpen(): boolean {
    return this.openSignal[0]();
  }

  get shouldLockScroll(): boolean {
    return this.options.lockScroll !== false;
  }

  open(): this {
    if (this.destroyed) {
      throw new Error("yapmod: cannot open a destroyed modal");
    }

    if (this.isOpen) {
      return this;
    }

    this.previousFocus = this.shouldFocus()
      ? document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      : null;

    this.openSignal[1](true);
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
    if (!this.isOpen) {
      return;
    }

    this.openSignal[1](false);

    const index = activeModals.indexOf(this);
    if (index !== -1) {
      activeModals.splice(index, 1);
    }

    document.removeEventListener("keydown", this.handleDocumentKeyDown, true);

    if (this.pendingMount) {
      document.removeEventListener("DOMContentLoaded", this.handleDomReady);
      this.pendingMount = false;
    }

    if (this.mounted) {
      this.elementRef.remove();
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

    if (this.isOpen) {
      this.close("destroy");
    } else {
      this.settle("destroy");
    }

    this.destroyed = true;

    for (const disposeButton of this.buttonRoots.splice(0)) {
      disposeButton();
    }

    this.dispose();
  }

  setTitle(title: string | null): void {
    this.titleSignal[1](title?.trim() ? title : null);
  }

  setDescription(description: string | null): void {
    this.descriptionSignal[1](
      description?.trim() ? description : null,
    );
  }

  setContent(content?: ModalContent): void {
    this.bodyRef.replaceChildren();

    if (content == null) {
      return;
    }

    const value = typeof content === "function" ? content(this) : content;

    if (value == null || value === "") {
      return;
    }

    this.bodyRef.appendChild(
      typeof value === "string" ? document.createTextNode(value) : value,
    );
  }

  addButton(button: ModalButton): HTMLButtonElement {
    this.footerSignal[1](true);

    const footer = this.footerRef;

    if (!footer) {
      throw new Error("yapmod: the modal footer is unavailable");
    }

    if (button.autofocus) {
      this.hasAutofocusButton = true;
    }

    const disposeButton = render(
      () => (
        <button
          class={classNames([
            "btn",
            button.variant === "secondary" ? "secondary" : "",
            button.variant === "danger" ? "yapmod-modal-danger" : "",
            // "native" keeps the styles of the host app, without our own tint.
            button.className ?? "",
          ])}
          type="button"
          disabled={button.disabled === true}
          data-yapmod-autofocus={button.autofocus ? "" : undefined}
          onClick={(event) => {
            const target = event.currentTarget;

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
                  console.error(
                    "[yapmod] modal button handler failed",
                    error,
                  );
                });

              return;
            }

            if (closeOnClick && result !== false) {
              this.close("button");
            }
          }}
        >
          {button.label}
        </button>
      ),
      footer,
    );

    this.buttonRoots.push(disposeButton);

    const element = footer.lastElementChild as HTMLButtonElement;

    return element;
  }

  private render(): JSX.Element {
    const [open] = this.openSignal;
    const [title] = this.titleSignal;
    const [description] = this.descriptionSignal;
    const [hasFooter] = this.footerSignal;

    return (
      <div
        ref={(element) => {
          this.elementRef = element;
        }}
        class="overlay yapmod-modal-overlay"
        data-yapmod-modal={this.id}
        hidden={!open()}
        onClick={this.handleBackdropClick}
      >
        <div
          ref={(element) => {
            this.dialogRef = element;
          }}
          class={classNames([
            "modal",
            "yapmod-modal",
            `yapmod-modal--${this.size}`,
            this.options.className,
          ])}
          data-yapmod-modal-dialog=""
          role="dialog"
          aria-modal="true"
          aria-labelledby={title() ? `${this.id}-title` : undefined}
          aria-label={
            title() ? undefined : (this.options.ariaLabel ?? "Yapmod dialog")
          }
          aria-describedby={
            description() ? `${this.id}-description` : undefined
          }
          tabIndex={-1}
        >
          {this.dismissible && (
            <button
              class="yapmod-modal-close"
              type="button"
              aria-label="Close dialog"
              onClick={() => this.close("dismiss")}
            >
              ×
            </button>
          )}

          <div
            class="modal-head yapmod-modal-head"
            style={{ display: title() || description() ? undefined : "none" }}
          >
            {title() ? <h2 id={`${this.id}-title`}>{title()}</h2> : null}
            {description() ? (
              <p id={`${this.id}-description`}>{description()}</p>
            ) : null}
          </div>

          <div
            ref={(element) => {
              this.bodyRef = element;
            }}
            class="modal-body yapmod-modal-body"
          />

          <div
            ref={(element) => {
              this.footerRef = element;
            }}
            class="modal-foot yapmod-modal-foot"
            style={{ display: hasFooter() ? undefined : "none" }}
          />
        </div>
      </div>
    );
  }

  private mount(): void {
    if (this.mounted) {
      return;
    }

    if (!document.body) {
      if (!this.pendingMount) {
        this.pendingMount = true;
        document.addEventListener("DOMContentLoaded", this.handleDomReady, {
          once: true,
        });
      }

      return;
    }

    ensureModalStyles();
    document.body.appendChild(this.elementRef);
    this.mounted = true;
  }

  private focusInitial(): void {
    if (!this.mounted || !this.shouldFocus()) {
      return;
    }

    const preferred = this.dialogRef.querySelector<HTMLElement>(
      "[autofocus], [data-yapmod-autofocus]",
    );
    (preferred ?? this.dialogRef).focus({ preventScroll: true });
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
      this.dialogRef.querySelectorAll<HTMLElement>(selector),
    ).filter((element) => element.getClientRects().length > 0);
  }

  private shouldFocus(): boolean {
    return this.autoFocus || this.hasAutofocusButton;
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = this.getFocusable();

    if (focusable.length === 0) {
      event.preventDefault();
      this.dialogRef.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || active === this.dialogRef) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
      return;
    }

    if (active === last || !this.dialogRef.contains(active)) {
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

    if (!this.isOpen) {
      return;
    }

    this.mount();
    this.focusInitial();
  };

  private handleBackdropClick = (event: MouseEvent): void => {
    if (event.target !== this.elementRef || !this.closeOnBackdrop) {
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
