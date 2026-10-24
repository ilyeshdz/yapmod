import { JSX } from "solid-js";
import { render } from "solid-js/web";

import type { UpdateInfo } from "../../shared/types";

function VersionRow(
  props: { label: string; version: string; class: string },
): JSX.Element {
  return (
    <div class={`yapmod-update-version ${props.class}`}>
      <span class="yapmod-update-version-label">{props.label}</span>
      <span class="yapmod-update-version-number">
        {props.version ? `v${props.version}` : "unknown"}
      </span>
    </div>
  );
}

/** The body of the update modal: just the two versions. */
export function UpdateContent(props: { info: UpdateInfo }): JSX.Element {
  return (
    <div class="yapmod-update-content">
      <VersionRow
        label="Installed"
        version={props.info.current_version}
        class="yapmod-update-version-installed"
      />
      <VersionRow
        label="Latest"
        version={props.info.latest_version}
        class="yapmod-update-version-latest"
      />
    </div>
  );
}

/** Renders the content the modal API receives as a plain node. */
export function mountUpdateContent(
  info: UpdateInfo,
): { element: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  const dispose = render(() => <UpdateContent info={info} />, host);

  return { element: host, dispose };
}
