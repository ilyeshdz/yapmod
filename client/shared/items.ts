import type { SettingsContext, SettingsItem } from "./types";
import { createElement } from "./ui";
import { createDropdown } from "./dropdown";

function controlId(context: SettingsContext, itemId: string): string {
  return `yapmod-${context.id}-${itemId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function createHint(text: string): HTMLElement {
  return createElement("span", { className: "hint", text });
}

function renderToggle(
  item: Extract<SettingsItem, { type: "toggle" }>,
): HTMLElement {
  const textChildren: Node[] = [
    createElement("div", { className: "toggle-label", text: item.label }),
  ];

  if (item.description) {
    textChildren.push(
      createElement("div", { className: "hint", text: item.description }),
    );
  }

  const input = createElement("input", {
    className: "switch",
    attrs: { "aria-label": item.label },
    props: {
      type: "checkbox",
      checked: item.value,
      disabled: item.disabled === true,
    },
    on: {
      change: (event) => {
        item.onChange((event.currentTarget as HTMLInputElement).checked);
      },
    },
  });

  return createElement("label", {
    className: "toggle-row",
    children: [createElement("div", { children: textChildren }), input],
  });
}

function renderSelect(
  item: Extract<SettingsItem, { type: "select" }>,
  context: SettingsContext,
  teardowns: (() => void)[],
): HTMLElement {
  const id = controlId(context, item.id);

  const dropdown = createDropdown({
    id,
    value: item.value,
    options: item.options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    onChange: (value) => {
      item.onChange(value);
    },
    disabled: item.disabled,
    ariaLabel: item.label,
  });

  teardowns.push(() => {
    dropdown.destroy();
  });

  const field = createElement("div", {
    className: "field",
    children: [
      createElement("label", { attrs: { for: id }, text: item.label }),
      dropdown.element,
    ],
  });

  if (item.description) {
    field.appendChild(createHint(item.description));
  }

  return field;
}

function renderInput(
  item: Extract<SettingsItem, { type: "text" | "number" }>,
  context: SettingsContext,
): HTMLElement {
  const id = controlId(context, item.id);
  const isNumber = item.type === "number";

  const input = createElement("input", {
    className: "input",
    attrs: { id },
    props: {
      type: item.type,
      value: String(item.value),
      disabled: item.disabled === true,
      placeholder: isNumber ? undefined : item.placeholder,
      maxLength: isNumber ? undefined : item.maxLength || undefined,
      min: isNumber && item.min !== undefined ? String(item.min) : undefined,
      max: isNumber && item.max !== undefined ? String(item.max) : undefined,
      step: isNumber && item.step !== undefined ? String(item.step) : undefined,
    },
    on: {
      change: (event) => {
        const target = event.currentTarget as HTMLInputElement;

        if (isNumber) {
          const next = Number(target.value);

          if (!Number.isFinite(next)) {
            target.value = String(item.value);
            return;
          }

          item.onChange(next);
          return;
        }

        item.onChange(target.value);
      },
    },
  });

  const field = createElement("div", {
    className: "field",
    children: [
      createElement("label", { attrs: { for: id }, text: item.label }),
      input,
    ],
  });

  if (item.description) {
    field.appendChild(createHint(item.description));
  }

  return field;
}

function renderButton(
  item: Extract<SettingsItem, { type: "button" }>,
): HTMLElement {
  const variant = item.variant ?? "primary";
  const className = [
    "btn",
    "small",
    variant === "secondary" ? "ghost" : "",
    variant === "danger" ? "danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createElement("button", {
    className,
    text: item.label,
    props: { type: "button" },
    on: {
      click: () => {
        item.onClick();
      },
    },
  });
}

function renderCustom(
  item: Extract<SettingsItem, { type: "custom" }>,
  context: SettingsContext,
  teardowns: (() => void)[],
): HTMLElement {
  const children: Node[] = [];

  if (item.label) {
    children.push(
      createElement("div", { className: "toggle-label", text: item.label }),
    );
  }

  if (item.description) {
    children.push(createHint(item.description));
  }

  const body = createElement("div");
  children.push(body);

  const teardown = item.render(body, context);

  if (typeof teardown === "function") {
    teardowns.push(teardown);
  }

  return createElement("div", { className: "yapmod-setting", children });
}

export function renderSettingsItem(
  item: SettingsItem,
  context: SettingsContext,
  teardowns: (() => void)[] = [],
): HTMLElement {
  switch (item.type) {
    case "toggle":
      return renderToggle(item);
    case "select":
      return renderSelect(item, context, teardowns);
    case "text":
    case "number":
      return renderInput(item, context);
    case "button":
      return renderButton(item);
    case "custom":
      return renderCustom(item, context, teardowns);
    default:
      return createElement("div");
  }
}
