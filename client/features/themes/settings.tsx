import { render } from "solid-js/web";
import type { SettingsSection } from "../../shared/types";
import { getYapmod } from "../../core/scope";
import { ThemePicker } from "./theme-picker";

const SECTION_ID = "yapmod-themes";

/**
 * The section sits in the group of the client, right under its own item.
 */
const GROUP_LABEL = "Yapmod";

function createThemeSection(): SettingsSection {
  return {
    id: SECTION_ID,
    label: "Themes",
    icon: "palette",
    group: GROUP_LABEL,
    order: 1,
    description:
      "Change how yapmod looks. A theme is a folder with a manifest and a stylesheet, and it is applied to the whole app.",
    render: (host) => {
      const themeApi = getYapmod().theme;
      const store = getYapmod().store;

      if (!themeApi || !store) {
        return;
      }

      const dispose = render(() => <ThemePicker themeApi={themeApi} store={store} />, host);

      return () => {
        dispose();
      };
    },
  };
}

/**
 * Registers the theme section in the settings of the app.
 */
export function installThemeSettings(): void {
  const yapmod = getYapmod();

  if (!yapmod.settings) {
    return;
  }

  yapmod.settings.register(createThemeSection());
}
