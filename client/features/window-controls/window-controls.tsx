import { For, JSX } from "solid-js";

import { Icon } from "../../components/icon";
import { invokeCommand } from "../../core/tauri";

export type WindowAction = "minimize" | "maximize" | "close";

const WINDOW_ACTIONS: Array<{
  action: WindowAction;
  label: string;
  command: string;
  path: string;
}> = [
  {
    action: "minimize",
    label: "Minimize window",
    command: "minimize_main_window",
    path: "M5 12h14",
  },
  {
    action: "maximize",
    label: "Maximize or restore window",
    command: "toggle_main_window_maximize",
    path: "M6.5 6.5h11v11h-11z",
  },
  {
    action: "close",
    label: "Close window",
    command: "close_main_window",
    path: "m7 7 10 10M17 7 7 17",
  },
];

/**
 * The window buttons that live in the topbar on Windows.
 *
 * The topbar is a deep drag region, so the buttons stop pointer events from
 * turning their clicks into window drags.
 */
export function WindowControls(): JSX.Element {
  return (
    <div
      class="yapmod-window-controls"
      data-yapmod-window-controls=""
      data-tauri-drag-region="false"
      role="group"
      aria-label="Window controls"
    >
      <For each={WINDOW_ACTIONS}>
        {(action) => (
          <button
            class={`yapmod-window-control yapmod-window-control-${action.action}`}
            type="button"
            title={action.label}
            aria-label={action.label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void invokeCommand<void>(action.command).catch((error: unknown) => {
                console.error(
                  `[yapmod] could not ${action.action} the window`,
                  error,
                );
              });
            }}
          >
            <Icon
              size={12}
              strokeWidth={1.5}
              paths={[[action.path]]}
            />
          </button>
        )}
      </For>
    </div>
  );
}
