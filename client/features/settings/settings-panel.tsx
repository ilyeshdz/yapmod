import { Show, JSX } from "solid-js";
import { render } from "solid-js/web";

import type { SettingsSection } from "../../shared/types";

export type SettingsPanelHandle = {
  /** The `<section>` that is inserted next to the native settings panel. */
  element: HTMLElement;
  /** The host of the declared items, when the section has any. */
  itemsHost: HTMLElement | null;
  /** The host passed to a custom `render` function, when there is one. */
  bodyHost: HTMLElement | null;
  dispose(): void;
};

/**
 * Builds the shell of a settings section.
 *
 * The host app only knows how to display its own React panels, so the client
 * inserts a sibling section. Its contents are still rendered by Solid; the
 * two host elements are handed back so the settings API can mount them.
 */
export function createSettingsPanel(
  section: SettingsSection,
): SettingsPanelHandle {
  const host = document.createElement("div");
  let element!: HTMLElement;
  let itemsHost: HTMLDivElement | undefined;
  let bodyHost: HTMLDivElement | undefined;

  const dispose = render(
    () => (
      <section
        ref={element}
        class="settings-main yapmod-settings-panel"
        data-yapmod-panel={section.id}
        hidden
      >
        <div class="yapmod-settings">
          <h2 class={section.description ? "yapmod-has-description" : undefined}>
            {section.label}
          </h2>
          <Show when={section.description}>
            <p class="hint yapmod-settings-description">{section.description}</p>
          </Show>
          <Show when={section.items?.length}>
            <div class="yapmod-settings-items" ref={itemsHost} />
          </Show>
          <Show when={section.render}>
            <div class="yapmod-settings-body" ref={bodyHost} />
          </Show>
        </div>
      </section>
    ),
    host,
  );

  return {
    element: host.firstElementChild as HTMLElement,
    itemsHost: itemsHost ?? null,
    bodyHost: bodyHost ?? null,
    dispose,
  };
}
