import { For, Show } from "solid-js";
import { onCleanup, onMount, JSX } from "solid-js";
import { render } from "solid-js/web";

import { Dropdown } from "../../components/dropdown";
import type { SettingsContext, SettingsItem } from "../../shared/types";

function controlId(context: SettingsContext, itemId: string): string {
  return `yapmod-${context.id}-${itemId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function Hint(props: { text: string }): JSX.Element {
  return <span class="hint">{props.text}</span>;
}

function ToggleItem(
  props: { item: Extract<SettingsItem, { type: "toggle" }> },
): JSX.Element {
  return (
    <label class="toggle-row">
      <div>
        <div class="toggle-label">{props.item.label}</div>
        <Show when={props.item.description}>
          <div class="hint">{props.item.description}</div>
        </Show>
      </div>
      <input
        class="switch"
        type="checkbox"
        aria-label={props.item.label}
        checked={props.item.value}
        disabled={props.item.disabled}
        onChange={(event) => {
          props.item.onChange(event.currentTarget.checked);
        }}
      />
    </label>
  );
}

function SelectItem(
  props: {
    item: Extract<SettingsItem, { type: "select" }>;
    context: SettingsContext;
  },
): JSX.Element {
  const id = controlId(props.context, props.item.id);

  return (
    <div class="field">
      <label for={id}>{props.item.label}</label>
      <Dropdown
        id={id}
        value={props.item.value}
        options={props.item.options}
        disabled={props.item.disabled}
        ariaLabel={props.item.label}
        onChange={(value) => props.item.onChange(value)}
      />
      <Show when={props.item.description}>
        <Hint text={props.item.description!} />
      </Show>
    </div>
  );
}

function TextItem(
  props: {
    item: Extract<SettingsItem, { type: "text" }>;
    context: SettingsContext;
  },
): JSX.Element {
  const id = controlId(props.context, props.item.id);

  return (
    <div class="field">
      <label for={id}>{props.item.label}</label>
      <input
        id={id}
        class="input"
        type="text"
        value={props.item.value}
        disabled={props.item.disabled}
        placeholder={props.item.placeholder}
        maxLength={props.item.maxLength || undefined}
        onChange={(event) => props.item.onChange(event.currentTarget.value)}
      />
      <Show when={props.item.description}>
        <Hint text={props.item.description!} />
      </Show>
    </div>
  );
}

function NumberItem(
  props: {
    item: Extract<SettingsItem, { type: "number" }>;
    context: SettingsContext;
  },
): JSX.Element {
  const id = controlId(props.context, props.item.id);

  return (
    <div class="field">
      <label for={id}>{props.item.label}</label>
      <input
        id={id}
        class="input"
        type="number"
        value={String(props.item.value)}
        disabled={props.item.disabled}
        min={props.item.min !== undefined ? String(props.item.min) : undefined}
        max={props.item.max !== undefined ? String(props.item.max) : undefined}
        step={
          props.item.step !== undefined ? String(props.item.step) : undefined
        }
        onChange={(event) => {
          const target = event.currentTarget;
          const next = Number(target.value);

          if (!Number.isFinite(next)) {
            target.value = String(props.item.value);
            return;
          }

          props.item.onChange(next);
        }}
      />
      <Show when={props.item.description}>
        <Hint text={props.item.description!} />
      </Show>
    </div>
  );
}

function ButtonItem(
  props: { item: Extract<SettingsItem, { type: "button" }> },
): JSX.Element {
  const variant = props.item.variant ?? "primary";

  return (
    <button
      classList={{
        btn: true,
        small: true,
        ghost: variant === "secondary",
        danger: variant === "danger",
      }}
      type="button"
      onClick={() => props.item.onClick()}
    >
      {props.item.label}
    </button>
  );
}

function CustomItem(
  props: {
    item: Extract<SettingsItem, { type: "custom" }>;
    context: SettingsContext;
  },
): JSX.Element {
  let host!: HTMLDivElement;

  onMount(() => {
    const teardown = props.item.render(host, props.context);

    if (typeof teardown === "function") {
      onCleanup(teardown);
    }
  });

  return (
    <div class="yapmod-setting">
      <Show when={props.item.label}>
        <div class="toggle-label">{props.item.label}</div>
      </Show>
      <Show when={props.item.description}>
        <Hint text={props.item.description!} />
      </Show>
      <div ref={host} />
    </div>
  );
}

function SettingsItemView(
  props: { item: SettingsItem; context: SettingsContext },
): JSX.Element {
  switch (props.item.type) {
    case "toggle":
      return <ToggleItem item={props.item} />;
    case "select":
      return <SelectItem item={props.item} context={props.context} />;
    case "text":
      return <TextItem item={props.item} context={props.context} />;
    case "number":
      return <NumberItem item={props.item} context={props.context} />;
    case "button":
      return <ButtonItem item={props.item} />;
    case "custom":
      return <CustomItem item={props.item} context={props.context} />;
    default:
      return <></>;
  }
}

/**
 * Renders the declared settings items into a host element.
 *
 * Returns the dispose function of the Solid root; the caller owns the host
 * and clears it when the section is refreshed.
 */
export function mountSettingsItems(
  items: SettingsItem[],
  host: HTMLElement,
  context: SettingsContext,
): () => void {
  return render(
    () => (
      <For each={items}>
        {(item) => <SettingsItemView item={item} context={context} />}
      </For>
    ),
    host,
  );
}
