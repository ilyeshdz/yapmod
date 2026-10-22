import { createElement, safeTeardown, createSvgIcon, createSvgCheck } from "./ui";

/**
 * A dropdown, in the shape the app it wraps uses.
 *
 * The markup, the class names and the behaviour follow the ones of the
 * host app, so a dropdown looks and feels the same wherever it is used.
 */

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type DropdownOptions = {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
};

export type Dropdown = {
  readonly element: HTMLElement;
  setValue(value: string): void;
  destroy(): void;
};

const CHEVRON_PATH =
  "M5.3 9.3a1 1 0 0 1 1.4 0L12 14.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z";

/**
 * The menu sits above everything else, including the dialogs of the
 * client itself.
 */
const MENU_Z_INDEX = "2147483640";

/**
 * A menu taller than this is scrolled instead.
 */
const MENU_MAX_HEIGHT = 320;

/**
 * A menu with more options than this gets a search field.
 */
const SEARCH_AFTER = 10;

let sequence = 0;

/**
 * The dropdowns that are open right now.
 *
 * Their menus live outside the panel they belong to, so they have to be
 * closed when the panel is hidden.
 */
const openDropdowns = new Set<() => void>();

/**
 * Closes every dropdown that is open.
 */
export function closeAllDropdowns(): void {
  safeTeardown([...openDropdowns]);
}

/**
 * Builds a dropdown.
 */
export function createDropdown(options: DropdownOptions): Dropdown {
  const listId = `yapmod-dd-${(sequence += 1)}`;
  const hasSearch = options.options.length > SEARCH_AFTER;

  let value = options.value;
  let open = false;
  let highlighted = 0;
  let query = "";
  let menu: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let search: HTMLInputElement | null = null;
  let typeAhead = "";
  let typeAheadAt = 0;

  const labelOf = (optionValue: string): string | undefined =>
    options.options.find((option) => option.value === optionValue)?.label;

  const valueElement = createElement("span", {
    className: "dd-value",
  });

  const trigger = createElement("button", {
    className: `${options.className ?? "input"} dd-trigger`,
    attrs: {
      type: "button",
      ...(options.id ? { id: options.id } : {}),
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      ...(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
    },
    props: { disabled: options.disabled === true },
    children: [valueElement, createSvgIcon("dd-chev", 16, CHEVRON_PATH)],
  });

  function updateValue(): void {
    const label = labelOf(value);
    const text = label ?? options.placeholder ?? "Pick one";

    valueElement.textContent = text;
    valueElement.classList.toggle("empty", !label);
  }

  function visibleOptions(): DropdownOption[] {
    const search = query.trim().toLowerCase();

    if (!search) {
      return options.options;
    }

    return options.options.filter((option) =>
      option.label.toLowerCase().includes(search),
    );
  }

  function updateHighlight(): void {
    if (!list) {
      return;
    }

    const items = list.querySelectorAll<HTMLElement>(".dd-opt");

    items.forEach((item, index) => {
      item.classList.toggle("hi", index === highlighted);
    });

    const current = items[highlighted];

    if (current) {
      list.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView({ block: "nearest" });
    } else {
      list.removeAttribute("aria-activedescendant");
    }
  }

  function buildList(): HTMLElement {
    const filtered = visibleOptions();

    const element = createElement("div", {
      className: "dd-list",
      attrs: {
        role: "listbox",
        id: listId,
      },
    });

    if (filtered.length === 0) {
      element.appendChild(
        createElement("div", {
          className: "dd-none",
          text: "Nothing matches",
        }),
      );
    }

    filtered.forEach((option, index) => {
      const selected = option.value === value;

      const item = createElement("div", {
        className: [
          "dd-opt",
          index === highlighted ? "hi" : "",
          selected ? "on" : "",
          option.disabled ? "off" : "",
        ]
          .filter(Boolean)
          .join(" "),
        attrs: {
          id: `${listId}-${index}`,
          role: "option",
          "aria-selected": selected ? "true" : "false",
          "aria-disabled": option.disabled ? "true" : "false",
        },
        on: {
          pointermove: () => {
            if (highlighted !== index) {
              highlighted = index;
              updateHighlight();
            }
          },
          click: () => {
            choose(option);
          },
        },
        children: [
          createElement("span", {
            className: "dd-label",
            text: option.label,
          }),
          ...(selected ? [createSvgCheck()] : []),
        ],
      });

      element.appendChild(item);
    });

    list = element;

    return element;
  }

  function buildMenu(): HTMLElement {
    const element = createElement("div", {
      className: "dd-menu",
      attrs: {
        style: `z-index: ${MENU_Z_INDEX}`,
      },
    });

    if (hasSearch) {
      search = createElement("input", {
        className: "input dd-search",
        attrs: {
          type: "text",
          placeholder: "Search",
          "aria-label": "Search options",
        },
        props: { value: query },
        on: {
          input: (event) => {
            query = (event.currentTarget as HTMLInputElement).value;
            highlighted = 0;
            replaceList();
          },
        },
      });

      element.appendChild(search);
    }

    element.appendChild(buildList());

    return element;
  }

  function replaceList(): void {
    if (!menu || !list) {
      return;
    }

    const previous = list;
    const next = buildList();

    menu.replaceChild(next, previous);
    updateHighlight();
  }

  function position(): void {
    if (!menu) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const height = Math.min(
      MENU_MAX_HEIGHT,
      36 * options.options.length + (hasSearch ? 52 : 0) + 12,
    );
    const width = Math.max(rect.width, 180);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    if (below >= height || below >= above) {
      menu.style.left = `${left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.bottom = "auto";
      menu.style.maxHeight = `${Math.max(120, Math.min(MENU_MAX_HEIGHT, below))}px`;
    } else {
      menu.style.left = `${left}px`;
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      menu.style.top = "auto";
      menu.style.maxHeight = `${Math.max(120, Math.min(MENU_MAX_HEIGHT, above))}px`;
    }

    menu.style.width = `${width}px`;
  }

  function close(restoreFocus = true): void {
    if (!open) {
      return;
    }

    open = false;
    openDropdowns.delete(close);
    menu?.remove();
    menu = null;
    list = null;
    search = null;

    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-controls");

    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);

    if (restoreFocus) {
      trigger.focus();
    }
  }

  function openMenu(): void {
    if (open || options.disabled) {
      return;
    }

    open = true;
    openDropdowns.add(close);
    query = "";
    highlighted = Math.max(
      0,
      options.options.findIndex((option) => option.value === value),
    );

    menu = buildMenu();
    document.body.appendChild(menu);
    position();

    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", listId);

    updateHighlight();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    if (search) {
      search.focus();
    }
  }

  function onPointerDown(event: Event): void {
    const target = event.target as Node | null;

    if (!target || menu?.contains(target) || trigger.contains(target)) {
      return;
    }

    close(false);
  }

  function onScroll(): void {
    if (!menu) {
      return;
    }

    position();
  }

  function choose(option: DropdownOption): void {
    if (option.disabled) {
      return;
    }

    if (option.value !== value) {
      value = option.value;
      updateValue();
      options.onChange(option.value);
    }

    close();
  }

  function move(step: number): void {
    const filtered = visibleOptions();

    if (filtered.length === 0) {
      return;
    }

    let index = highlighted;

    for (let count = 0; count < filtered.length; count += 1) {
      index = (index + step + filtered.length) % filtered.length;

      if (!filtered[index].disabled) {
        highlighted = index;
        break;
      }
    }

    updateHighlight();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      if (open) {
        close(false);
      }

      return;
    }

    if (!open) {
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
        highlighted = 0;
        updateHighlight();
        return;
      case "End": {
        event.preventDefault();
        const filtered = visibleOptions();
        highlighted = Math.max(0, filtered.length - 1);
        updateHighlight();
        return;
      }
      case "Enter":
        event.preventDefault();
        choose(visibleOptions()[highlighted]);
        return;
      default:
        break;
    }

    // Typing picks an option, the way a native select does.
    if (hasSearch || event.ctrlKey || event.metaKey || event.key.length !== 1) {
      return;
    }

    const now = Date.now();
    typeAhead =
      now - typeAheadAt < 700 ? typeAhead + event.key.toLowerCase() : event.key.toLowerCase();
    typeAheadAt = now;

    const filtered = visibleOptions();
    const index = filtered.findIndex((option) =>
      option.label.toLowerCase().replace(/^#/, "").startsWith(typeAhead),
    );

    if (index >= 0) {
      highlighted = index;
      updateHighlight();
    }
  }

  trigger.addEventListener("click", () => {
    if (open) {
      close();
    } else {
      openMenu();
    }
  });

  trigger.addEventListener("keydown", onKeyDown);

  updateValue();

  return {
    element: trigger,

    setValue(next: string): void {
      value = next;
      updateValue();
    },

    destroy(): void {
      close(false);
      trigger.removeEventListener("keydown", onKeyDown);
    },
  };
}
