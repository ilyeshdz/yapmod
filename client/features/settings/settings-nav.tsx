import { JSX } from "solid-js";
import { render } from "solid-js/web";

import { Icon } from "../../components/icon";
import type { SettingsSection } from "../../shared/types";

type SettingsSectionIcon = NonNullable<SettingsSection["icon"]>;

const SECTION_ICON_SHAPES: Record<SettingsSectionIcon, string[]> = {
  monitor: [
    "M4 4h16a1 1 0 0 1 1 1v11H3V5a1 1 0 0 1 1-1Z",
    "M8 20h8",
    "M12 16v4",
  ],
  palette: [
    "M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 1.1-2.5 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3 10 10 0 0 0-9-10Z",
    "M7.5 10h.01",
    "M11 7h.01",
    "M16 8.5h.01",
  ],
  history: ["M3 12a9 9 0 1 0 2.64-6.36L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  puzzle: [
    "M20 13.2a2.8 2.8 0 1 0-3.2-3.2V4h-4.2a2.8 2.8 0 1 0-5.6 0H3v5.8a2.8 2.8 0 1 1 0 5.6V21h6.2a2.8 2.8 0 1 1 5.6 0H21v-4.2a2.8 2.8 0 0 1-1-3.6Z",
  ],
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
