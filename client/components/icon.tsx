import { JSX } from "solid-js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type IconProps = {
  name: string;
  class?: string;
  size?: number;
  paths: string[][];
};

/**
 * Renders an SVG icon from a set of path data strings.
 * Each path group is a separate `<path>` element, allowing multi-shape icons.
 */
export function Icon(props: IconProps): JSX.Element {
  return (
    <svg
      xmlns={SVG_NS}
      class={props.class}
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox={`0 0 24 24`}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    >
      {props.paths.flatMap((group) =>
        group.map((d) => (
          <path d={d} />
        ))
      )}
    </svg>
  );
}
