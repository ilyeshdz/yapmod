import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  JSX,
} from "solid-js";
import { For, Portal, Show } from "solid-js/web";

import { Icon } from "./icon";

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type DropdownProps = {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  class?: string;
  placeholder?: string;
};

const CHEVRON_PATH = [
  "M5.3 9.3a1 1 0 0 1 1.4 0L12 14.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z",
];

const CHECK_PATH = ["M5 13l4 4L19 7"];

/** The menu sits above everything else, including the dialogs of the client. */
const MENU_Z_INDEX = 2147483640;

/** A menu taller than this is scrolled instead. */
const MENU_MAX_HEIGHT = 320;

/** A menu with more options than this gets a search field. */
const SEARCH_AFTER = 10;

let sequence = 0;

/**
 * The dropdowns that are open right now.
 *
 * Their menus live outside the panel they belong to, so they have to be
 * closed when the panel is hidden.
 */
const openDropdowns = new Set<() => void>();

/** Closes every dropdown that is open. */
export function closeAllDropdowns(): void {
  for (const close of [...openDropdowns]) {
    close();
  }

  openDropdowns.clear();
}

type Position = {
  left: number;
  top: number | null;
  bottom: number | null;
  width: number;
  maxHeight: number;
};

/**
 * A dropdown in the shape of the host app.
 *
 * The menu is portalled to the document body: it must escape overflow and
 * stacking contexts of the settings panel, and it must stay usable while it
 * is open, even if the panel re-renders around it.
 */
export function Dropdown(props: DropdownProps): JSX.Element {
  const listId = props.id ?? `yapmod-dd-${(sequence += 1)}`;
  const hasSearch = () => props.options.length > SEARCH_AFTER;

  const [value, setValue] = createSignal(props.value);
  const [open, setOpen] = createSignal(false);
  const [highlighted, setHighlighted] = createSignal(0);
  const [query, setQuery] = createSignal("");
  const [position, setPosition] = createSignal<Position | null>(null);

  let triggerRef: HTMLButtonElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;
  let typeAhead = "";
  let typeAheadAt = 0;

  const labelOf = (optionValue: string): string | undefined =>
    props.options.find((option) => option.value === optionValue)?.label;

  const displayText = createMemo(
    () => labelOf(value()) ?? props.placeholder ?? "Pick one",
  );

  const visibleOptions = createMemo(() => {
    const search = query().trim().toLowerCase();

    if (!search) {
      return props.options;
    }

    return props.options.filter((option) =>
      option.label.toLowerCase().includes(search),
    );
  });

  // The value can be driven from the outside (a store change, a refresh of
  // the section), so the trigger follows `props.value`.
  createEffect(() => {
    const next = props.value;

    if (next !== value()) {
      setValue(next);
    }
  });

  function measure(trigger: HTMLButtonElement): Position {
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const height = Math.min(
      MENU_MAX_HEIGHT,
      36 * props.options.length + (hasSearch() ? 52 : 0) + 12,
    );
    const width = Math.max(rect.width, 180);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    if (below >= height || below >= above) {
      return {
        left,
        top: rect.bottom + 4,
        bottom: null,
        width,
        maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, below)),
      };
    }

    return {
      left,
      top: null,
      bottom: window.innerHeight - rect.top + 4,
      width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, above)),
    };
  }

  function updatePosition(): void {
    if (!triggerRef) {
      return;
    }

    setPosition(measure(triggerRef));
  }

  function scrollHighlightIntoView(): void {
    const current = menuRef?.querySelector<HTMLElement>(
      `#${CSS.escape(listId)}-${highlighted()}`,
    );

    current?.scrollIntoView({ block: "nearest" });
  }

  function close(restoreFocus = true): void {
    if (!open()) {
      return;
    }

    setOpen(false);
    openDropdowns.delete(close);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("scroll", updatePosition, true);
    window.removeEventListener("resize", updatePosition);
    menuRef = undefined;
    searchRef = undefined;

    if (restoreFocus && triggerRef?.isConnected) {
      triggerRef.focus();
    }
  }

  function openMenu(): void {
    if (open() || props.disabled) {
      return;
    }

    typeAhead = "";
    typeAheadAt = 0;
    setQuery("");
    setHighlighted(
      Math.max(
        0,
        props.options.findIndex((option) => option.value === value()),
      ),
    );
    setOpen(true);
    openDropdowns.add(close);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
  }

  function onPointerDown(event: Event): void {
    const target = event.target as Node | null;

    if (
      !target ||
      menuRef?.contains(target) ||
      triggerRef?.contains(target)
    ) {
      return;
    }

    close(false);
  }

  function choose(option: DropdownOption): void {
    if (option.disabled) {
      return;
    }

    if (option.value !== value()) {
      setValue(option.value);
      props.onChange(option.value);
    }

    close();
  }

  function move(step: number): void {
    const filtered = visibleOptions();

    if (filtered.length === 0) {
      return;
    }

    let index = highlighted();

    for (let count = 0; count < filtered.length; count += 1) {
      index = (index + step + filtered.length) % filtered.length;

      if (!filtered[index].disabled) {
        setHighlighted(index);
        break;
      }
    }

    scrollHighlightIntoView();
  }

  function isTextInput(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      if (open()) {
        close(false);
      }

      return;
    }

    if (!open()) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }

      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        event.preventDefault();
        setHighlighted(0);
        scrollHighlightIntoView();
        return;
      case "End":
        event.preventDefault();
        setHighlighted(Math.max(0, visibleOptions().length - 1));
        scrollHighlightIntoView();
        return;
      case "Enter": {
        event.preventDefault();
        const option = visibleOptions()[highlighted()];

        if (option) {
          choose(option);
        }

        return;
      }
      default:
        break;
    }

    // Typing picks an option, the way a native select does. That only makes
    // sense when the keystroke is not going into the search field.
    if (
      hasSearch() ||
      isTextInput(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.key.length !== 1
    ) {
      return;
    }

    const now = Date.now();
    typeAhead =
      now - typeAheadAt < 700
        ? typeAhead + event.key.toLowerCase()
        : event.key.toLowerCase();
    typeAheadAt = now;

    const filtered = visibleOptions();
    const index = filtered.findIndex((option) =>
      option.label.toLowerCase().replace(/^#/, "").startsWith(typeAhead),
    );

    if (index >= 0) {
      setHighlighted(index);
      scrollHighlightIntoView();
    }
  }

  createEffect(() => {
    if (open() && hasSearch()) {
      // The search field is rendered inside the menu.
      queueMicrotask(() => searchRef?.focus());
    }
  });

  onCleanup(() => {
    close(false);
  });

  return (
    <>
      <button
        ref={triggerRef}
        id={props.id}
        class={`${props.class ?? "input"} dd-trigger${open() ? " open" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open() ? "true" : "false"}
        aria-controls={open() ? listId : undefined}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        onClick={() => {
          if (open()) {
            close();
          } else {
            openMenu();
          }
        }}
        onKeyDown={onKeyDown}
      >
        <span class={`dd-value${labelOf(value()) ? "" : " empty"}`}>
          {displayText()}
        </span>
        <Icon class="dd-chev" size={16} paths={[CHEVRON_PATH]} />
      </button>

      <Show when={open()}>
        <Portal mount={document.body}>
          <div
            ref={(element) => {
              menuRef = element;
              updatePosition();
            }}
            class="dd-menu"
            style={{
              "z-index": String(MENU_Z_INDEX),
              left: position() ? `${position()!.left}px` : undefined,
              top:
                position()?.top != null
                  ? `${position()!.top}px`
                  : undefined,
              bottom:
                position()?.bottom != null
                  ? `${position()!.bottom}px`
                  : undefined,
              width: position() ? `${position()!.width}px` : undefined,
              "max-height": position()
                ? `${position()!.maxHeight}px`
                : undefined,
            }}
            onKeyDown={onKeyDown}
          >
            <Show when={hasSearch()}>
              <input
                ref={searchRef}
                class="input dd-search"
                type="text"
                placeholder="Search"
                aria-label="Search options"
                value={query()}
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setHighlighted(0);
                }}
              />
            </Show>
            <div class="dd-list" role="listbox" id={listId}>
              <Show
                when={visibleOptions().length > 0}
                fallback={<div class="dd-hint">Nothing matches</div>}
              >
                <For each={visibleOptions()}>
                  {(option, index) => (
                    <div
                      id={`${listId}-${index()}`}
                      classList={{
                        "dd-option": true,
                        highlighted: index() === highlighted(),
                        selected: option.value === value(),
                        disabled: option.disabled === true,
                      }}
                      role="option"
                      aria-selected={
                        option.value === value() ? "true" : "false"
                      }
                      aria-disabled={option.disabled ? "true" : "false"}
                      onPointerMove={() => {
                        if (highlighted() !== index()) {
                          setHighlighted(index());
                        }
                      }}
                      onClick={() => choose(option)}
                    >
                      <span class="dd-label">{option.label}</span>
                      <Show when={option.value === value()}>
                        <Icon class="dd-check" size={18} paths={[CHECK_PATH]} />
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
