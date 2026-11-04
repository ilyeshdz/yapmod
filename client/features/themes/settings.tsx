import { render } from "solid-js/web";
import type { SettingsSection } from "../../shared/types";
import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";
import { ThemePicker } from "./theme-picker";

const SECTION_ID = "yapmod-themes";

/**
 * The section sits in the group of the client, right under its own item.
 */
const GROUP_LABEL = "Yapmod";

function createThemeSection(): SettingsSection {
  const host = getHost();
  const filesystem = host.capabilities.packages === "filesystem";

  return {
    id: SECTION_ID,
    label: "Themes",
    icon: "palette",
    group: GROUP_LABEL,
    order: 1,
    description: filesystem
      ? "Change how yapmod looks. A theme is a folder with a manifest and a stylesheet, and it is applied to the whole app."
      : "Change how yapmod looks. Browse community themes and apply one to the whole app.",
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

  if (!yapmod.settings || !getHost().themes) {
    return;
  }

  yapmod.settings.register(createThemeSection());
}
