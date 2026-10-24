import type { JSX } from "solid-js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type IconProps = {
  class?: string;
  size?: number;
  /** One path list per shape. Each shape is rendered as its own `<path>`. */
  paths: readonly (readonly string[])[];
  strokeWidth?: number;
  /** Icons are decorative by default; give one a label if it carries meaning. */
  label?: string;
};

/** Renders an SVG icon from a set of path data strings. */
export function Icon(props: IconProps): JSX.Element {
  return (
    <svg
      xmlns={SVG_NS}
      class={props.class}
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width={props.strokeWidth ?? 2}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      {props.paths.flatMap((group) =>
        group.map((d) => <path d={d} />),
      )}
    </svg>
  );
}
