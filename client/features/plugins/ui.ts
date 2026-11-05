import { iconPaths } from "../../components/icons";
import type {
  PluginUiBadgeOptions,
  PluginUiBadgeTone,
  PluginUiButtonOptions,
  PluginUiFieldOptions,
  PluginUiIconName,
  PluginUiIconOptions,
  PluginUiInputOptions,
  PluginUiSelectOptions,
  PluginUiToggleOptions,
  YapmodPluginUiApi,
} from "../../shared/types";
import { upsertStyle } from "../../shared/ui";
import { getYapmod } from "../../core/scope";
import pluginUiCSS from "../../styles/plugin-ui.css";

const SVG_NS = "http://www.w3.org/2000/svg";
const STYLE_ID = "yapmod-plugin-components";

function addClasses(element: Element, classes: string | undefined): void {
  if (!classes) {
    return;
  }

  for (const name of classes.split(/\s+/)) {
    if (name) {
      element.classList.add(name);
    }
  }
}

function createIcon(
  name: PluginUiIconName,
  options: PluginUiIconOptions = {},
): SVGSVGElement {
  const shapes = iconPaths[name];

  if (!shapes) {
    throw new Error(`Unknown plugin UI icon: ${String(name)}`);
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  const size = options.size ?? 18;

  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.classList.add("yapmod-ui-icon");
  addClasses(svg, options.class);

  if (options.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  for (const shape of shapes) {
    for (const pathData of shape) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }
  }

  return svg;
}

function createButton(options: PluginUiButtonOptions = {}): HTMLButtonElement {
  const button = document.createElement("button");
  const size = options.size ?? "medium";
  const variant = options.variant ?? "secondary";
  const hasText = typeof options.label === "string" && options.label.length > 0;

  button.type = "button";
  button.className = "yapmod-ui-button";
  button.classList.add(`yapmod-ui-button-${variant}`);
  button.classList.add(`yapmod-ui-button-${size}`);

  if (options.icon && !hasText) {
    button.classList.add("yapmod-ui-button-icon");
  }

  addClasses(button, options.class);

  if (options.icon) {
    button.append(createIcon(options.icon, { size: size === "small" ? 15 : 17 }));
  }

  if (hasText) {
    const label = document.createElement("span");
    label.className = "yapmod-ui-button-label";
    label.textContent = options.label ?? "";
    button.append(label);
  }

  const accessibleName = options.title ?? options.label ?? options.icon ?? "Button";
  button.setAttribute("aria-label", accessibleName);

  if (options.title) {
    button.title = options.title;
  }

  if (options.disabled) {
    button.disabled = true;
  }

  if (options.onClick) {
    button.addEventListener("click", options.onClick);
  }

  return button;
}

function createInput(options: PluginUiInputOptions = {}): HTMLInputElement {
  const input = document.createElement("input");

  input.type = options.type ?? "text";
  input.className = "yapmod-ui-input";

  if (options.value !== undefined) {
    input.value = options.value;
  }

  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }

  if (options.ariaLabel) {
    input.setAttribute("aria-label", options.ariaLabel);
  }

  if (options.disabled) {
    input.disabled = true;
  }

  if (options.onInput) {
    input.addEventListener("input", () => options.onInput?.(input.value));
  }

  if (options.onChange) {
    input.addEventListener("change", () => options.onChange?.(input.value));
  }

  return input;
}

function createSelect(options: PluginUiSelectOptions): HTMLSelectElement {
  const select = document.createElement("select");

  select.className = "yapmod-ui-select";

  if (!Array.isArray(options.options)) {
    throw new Error("A plugin UI select requires an options list.");
  }

  for (const option of options.options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.disabled = Boolean(option.disabled);
    select.append(element);
  }

  if (options.value !== undefined) {
    select.value = options.value;
  }

  if (options.ariaLabel) {
    select.setAttribute("aria-label", options.ariaLabel);
  }

  if (options.disabled) {
    select.disabled = true;
  }

  if (options.onChange) {
    select.addEventListener("change", () => options.onChange?.(select.value));
  }

  return select;
}

function createToggle(options: PluginUiToggleOptions): HTMLElement {
  const row = document.createElement("label");
  const text = document.createElement("span");
  const label = document.createElement("span");
  const input = document.createElement("input");

  row.className = "yapmod-ui-toggle";
  text.className = "yapmod-ui-toggle-text";
  label.className = "yapmod-ui-toggle-label";
  label.textContent = options.label;
  text.append(label);

  if (options.description) {
    const description = document.createElement("span");
    description.className = "yapmod-ui-toggle-description";
    description.textContent = options.description;
    text.append(description);
  }

  input.type = "checkbox";
  input.className = "yapmod-ui-switch";
  input.setAttribute("aria-label", options.label);
  input.checked = Boolean(options.checked);
  input.disabled = Boolean(options.disabled);

  if (options.onChange) {
    input.addEventListener("change", () => options.onChange?.(input.checked));
  }

  row.append(text, input);

  return row;
}

function createField(options: PluginUiFieldOptions): HTMLElement {
  if (!(options.control instanceof HTMLElement)) {
    throw new Error("A plugin UI field requires a control element.");
  }

  const field = document.createElement("div");
  field.className = "yapmod-ui-field";

  if (options.label || options.description) {
    const header = document.createElement("div");
    header.className = "yapmod-ui-field-header";

    if (options.label) {
      const label = document.createElement("label");
      label.className = "yapmod-ui-field-label";
      label.textContent = options.label;

      const target = options.htmlFor ?? options.control.id;
      if (target) {
        label.htmlFor = target;
      }

      header.append(label);
    }

    if (options.description) {
      const description = document.createElement("span");
      description.className = "yapmod-ui-field-description";
      description.textContent = options.description;
      header.append(description);
    }

    field.append(header);
  }

  const control = document.createElement("div");
  control.className = "yapmod-ui-field-control";
  control.append(options.control);
  field.append(control);

  return field;
}

function createToolbar(...children: (Node | string)[]): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "yapmod-ui-toolbar";

  for (const child of children) {
    if (typeof child === "string") {
      const text = document.createElement("span");
      text.className = "yapmod-ui-toolbar-text";
      text.textContent = child;
      toolbar.append(text);
    } else {
      toolbar.append(child);
    }
  }

  return toolbar;
}

function createBadge(
  text: string,
  options: PluginUiBadgeOptions = {},
): HTMLElement {
  const badge = document.createElement("span");
  const tone: PluginUiBadgeTone = options.tone ?? "neutral";

  badge.className = "yapmod-ui-badge";
  badge.dataset.tone = tone;
  badge.textContent = text;

  if (options.title) {
    badge.title = options.title;
  }

  return badge;
}

const uiApi: YapmodPluginUiApi = Object.freeze({
  icons: Object.freeze([...Object.keys(iconPaths)] as PluginUiIconName[]),
  icon: createIcon,
  button: createButton,
  input: createInput,
  select: createSelect,
  toggle: createToggle,
  field: createField,
  toolbar: createToolbar,
  badge: createBadge,
});

/** Installs the themed component API used by plugin interfaces. */
export function installPluginUiApi(): void {
  upsertStyle(STYLE_ID, pluginUiCSS);
  getYapmod().ui = uiApi;
}
