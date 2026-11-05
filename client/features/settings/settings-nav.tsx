import { Icon } from "../../components/icon";
import { history } from "../../components/icons/history";
import { monitor } from "../../components/icons/monitor";
import { palette } from "../../components/icons/palette";
import { puzzle } from "../../components/icons/puzzle";
import type { SettingsSection } from "../../shared/types";
import { renderElement } from "../../shared/solid";

type SettingsSectionIcon = NonNullable<SettingsSection["icon"]>;

const SECTION_ICON_SHAPES: Record<SettingsSectionIcon, readonly string[]> = {
  monitor,
  palette,
  history,
  puzzle,
};

/** The label that introduces a group of sections in the host navigation. */
export function createNavLabel(name: string): HTMLElement {
  return renderElement(() => <div class="settings-nav-label">{name}</div>);
}

/** One section button in the host navigation. */
export function createNavButton(section: SettingsSection): HTMLButtonElement {
  return renderElement<HTMLButtonElement>(() => (
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
  ));
}
