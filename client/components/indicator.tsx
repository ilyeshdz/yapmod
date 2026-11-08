import type { JSX } from "solid-js";
import { Icon } from "./icon";
import type { IconName } from "./icons";

export type IndicatorProps = {
  /** The icon shown in the indicator. */
  icon: IconName;
  /** The text shown in the tooltip and read by assistive technology. */
  label: string;
  class?: string;
};

/**
 * A small, focusable icon with a tooltip.
 *
 * The wrapper carries the accessible name, so the tooltip stays purely
 * visual. Focusing the indicator shows the same explanation as hovering it.
 */
export function Indicator(props: IndicatorProps): JSX.Element {
  return (
    <span
      class={`yapmod-indicator${props.class ? ` ${props.class}` : ""}`}
      role="img"
      tabIndex={0}
      aria-label={props.label}
    >
      <Icon name={props.icon} size={14} strokeWidth={2.1} />
      <span class="yapmod-indicator-tooltip" aria-hidden="true">
        {props.label}
      </span>
    </span>
  );
}
