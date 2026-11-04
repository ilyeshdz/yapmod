import type { JSX } from "solid-js";
import { Icon } from "./icon";
import type { IconName } from "./icons";

export type IconButtonProps = {
  /** A named icon from the shared registry. */
  icon: IconName;
  /** Accessible name; also the default tooltip. Keep it specific. */
  label: string;
  title?: string;
  class?: string;
  iconClass?: string;
  size?: number;
  strokeWidth?: number;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
};

/**
 * A compact button whose visible content is a single icon.
 *
 * Icon-only controls rely on `label` for both screen readers and the native
 * tooltip, so callers should describe the action, not the glyph.
 */
export function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <button
      class={props.class}
      type="button"
      aria-label={props.label}
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon
        class={props.iconClass}
        name={props.icon}
        size={props.size ?? 20}
        strokeWidth={props.strokeWidth}
      />
    </button>
  );
}
