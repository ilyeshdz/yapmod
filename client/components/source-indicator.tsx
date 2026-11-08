import type { JSX } from "solid-js";
import { Indicator } from "./indicator";

export type PackageSource = "community" | "local" | "builtin";

type SourceIndicatorProps = {
  source: PackageSource;
  /** The package kind, used in the tooltip ("theme" or "plugin"). */
  noun: string;
};

function sourceIcon(source: PackageSource): "globe" | "folder" | "monitor" {
  if (source === "community") {
    return "globe";
  }

  return source === "local" ? "folder" : "monitor";
}

function sourceLabel(source: PackageSource, noun: string): string {
  if (source === "community") {
    return `Available in the community ${noun} catalog`;
  }

  if (source === "local") {
    return `Installed locally on this device`;
  }

  return "Bundled with Yapper";
}

/** Distinguishes community packages from local ones without a text badge. */
export function SourceIndicator(
  props: SourceIndicatorProps,
): JSX.Element {
  return (
    <Indicator
      icon={sourceIcon(props.source)}
      label={sourceLabel(props.source, props.noun)}
      class={`yapmod-source-indicator yapmod-source-${props.source}`}
    />
  );
}
