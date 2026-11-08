import { Show, JSX } from "solid-js";
import { Indicator } from "./indicator";
import {
  SourceIndicator,
  type PackageSource,
} from "./source-indicator";

export type PackageCardProps = {
  name: string;
  meta?: string | null;
  description?: string | null;
  source?: PackageSource;
  /** The package kind, used by the source tooltip ("theme" or "plugin"). */
  sourceNoun?: string;
  verified?: boolean;
  /** Marks the card that is currently selected, such as the active theme. */
  active?: boolean;
  /** Secondary, icon-only actions shown on the left of the footer. */
  actions?: JSX.Element;
  /** Switches and selection controls shown on the right of the footer. */
  controls?: JSX.Element;
  /** Extra content, such as an error or warning, below the description. */
  children?: JSX.Element;
};

/**
 * The shared card used by the Themes and Plugins galleries.
 *
 * The two sections only differ in the actions and controls they pass in, so
 * identity, metadata, source indicators and spacing stay identical.
 */
export function PackageCard(props: PackageCardProps): JSX.Element {
  return (
    <article
      classList={{
        "yapmod-package-card": true,
        "yapmod-package-card-active": props.active === true,
      }}
    >
      <div class="yapmod-package-card-body">
        <div class="yapmod-package-card-title-row">
          <div class="yapmod-package-card-heading">
            <h3 class="yapmod-package-card-name">{props.name}</h3>
            <Show when={props.source}>
              <SourceIndicator
                source={props.source!}
                noun={props.sourceNoun ?? "package"}
              />
            </Show>
            <Show when={props.verified}>
              <Indicator
                icon="check"
                label="Reviewed and verified by the Yapmod maintainers"
                class="yapmod-verified-indicator"
              />
            </Show>
          </div>
        </div>
        <Show when={props.meta}>
          <p class="yapmod-package-card-meta">{props.meta}</p>
        </Show>
        <Show when={props.description}>
          <p class="yapmod-package-card-description">{props.description}</p>
        </Show>
        {props.children}
      </div>
      <Show when={props.actions || props.controls}>
        <div class="yapmod-package-card-foot">
          <div class="yapmod-package-card-actions">{props.actions}</div>
          <div class="yapmod-package-card-controls">{props.controls}</div>
        </div>
      </Show>
    </article>
  );
}
