import { JSX } from "solid-js";
import { render } from "solid-js/web";

import { Icon } from "../../components/icon";
import { history } from "../../components/icons/history";
import { monitor } from "../../components/icons/monitor";
import { palette } from "../../components/icons/palette";
import { puzzle } from "../../components/icons/puzzle";
import type { SettingsSection } from "../../shared/types";

type SettingsSectionIcon = NonNullable<SettingsSection["icon"]>;

const SECTION_ICON_SHAPES: Record<SettingsSectionIcon, readonly string[]> = {
  monitor,
  palette,
  history,
  puzzle,
};

function renderStatic(component: () => JSX.Element): HTMLElement {
  const host = document.createElement("div");
  const dispose = render(component, host);
  const element = host.firstElementChild as HTMLElement;
  dispose();
  return element;
}

/** The label that introduces a group of sections in the host navigation. */
export function createNavLabel(name: string): HTMLElement {
  return renderStatic(() => <div class="settings-nav-label">{name}</div>);
}

/** One section button in the host navigation. */
export function createNavButton(section: SettingsSection): HTMLButtonElement {
  return renderStatic(() => (
    <button
      type="button"
      data-yapmod-section={section.id}
      aria-label={section.label}
    >
      {section.icon ? (
        <Icon
          class="yapmod-settings-nav-icon"
          size={24}
          paths={[SECTION_ICON_SHAPES[section.icon]]}
        />
      ) : null}
      {section.label}
    </button>
  )) as HTMLButtonElement;
}
