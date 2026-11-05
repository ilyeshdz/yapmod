import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  JSX,
} from "solid-js";

import type { CommunityTheme, ThemeBundle } from "./types";
import type { YapmodThemeApi } from "./api";
import type { YapmodStoreApi } from "../../shared/types";
import { Dropdown } from "../../components/dropdown";
import { openExternally } from "../../core/links";
import { getHost } from "../../platform/host";
import { confirmRemove } from "./picker-preview";
import { ensureStyle } from "../../shared/ui";
import themeCSS from "../../styles/themes.css";
import { CommunityThemeCard, InstalledThemeCard } from "./theme-card";

const UI_STYLE_ID = "yapmod-theme-ui-styles";

export type ThemePickerProps = {
  themeApi: YapmodThemeApi;
  store: YapmodStoreApi;
};

/**
 * The theme gallery, rendered inside the host settings panel.
 */
export function ThemePicker(props: ThemePickerProps): JSX.Element {
  const { themeApi, store } = props;
  const packages = getHost().capabilities.packages;
  const filesystem = packages === "filesystem";
  const canImport = packages !== "none";

  const [installedThemes, setInstalledThemes] = createSignal<ThemeBundle[]>([]);
  const [communityThemes, setCommunityThemes] = createSignal<CommunityTheme[]>(
    [],
  );
  const [communityLoaded, setCommunityLoaded] = createSignal(false);
  const [communityLoading, setCommunityLoading] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"installed" | "community">(
    "installed",
  );
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeId, setActiveId] = createSignal(
    store.get<string>("theme_id", "") ?? "",
  );
  const [mode, setMode] = createSignal(
    store.get<string>("theme_mode", "system") ?? "system",
  );
  const [status, setStatus] = createSignal({ message: "", error: false });

  const installedIds = createMemo(
    () => new Set(installedThemes().map((theme) => theme.id)),
  );

  const filteredCommunity = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();

    if (!query) {
      return communityThemes();
    }

    return communityThemes().filter((theme) =>
      [theme.name, theme.author, theme.description, ...theme.tags]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  });

  function setMessage(message: string, error = false): void {
    setStatus({ message, error });
  }

  function select(theme: ThemeBundle | null): void {
    store.set("theme_id", theme?.id ?? "");
    setActiveId(theme?.id ?? "");
    themeApi.apply(theme);
  }

  async function refresh(): Promise<void> {
    try {
      setInstalledThemes(await themeApi.list());
    } catch (error) {
      setMessage(String(error), true);
    }
  }

  async function loadCommunity(force = false): Promise<void> {
    if (communityLoading() || (communityLoaded() && !force)) {
      return;
    }

    setCommunityLoading(true);
    setMessage("Loading community themes…");

    try {
      const themes = await themeApi.listCommunity();
      setCommunityThemes(themes);
      setCommunityLoaded(true);
      setMessage(
        themes.length === 0
          ? "No community themes are published yet."
          : `${themes.length} community theme${themes.length === 1 ? "" : "s"} available.`,
      );
    } catch (error) {
      setMessage(
        `Could not load community themes: ${String(error)}`,
        true,
      );
    } finally {
      setCommunityLoading(false);
    }
  }

  async function installCommunityTheme(theme: CommunityTheme): Promise<void> {
    try {
      setMessage(`Installing ${theme.name}…`);
      await themeApi.installCommunity(theme.id);
      setInstalledThemes(await themeApi.list());
      setActiveTab("installed");
      setMessage(`Installed ${theme.name}.`);
    } catch (error) {
      setMessage(String(error), true);
    }
  }

  async function importTheme(): Promise<void> {
    try {
      const source = await themeApi.pickFolder();

      if (!source) {
        return;
      }

      setMessage("Installing…");
      const theme = await themeApi.install(source);
      setMessage(`Installed ${theme?.name ?? "the theme"}.`);
      await refresh();
    } catch (error) {
      setMessage(String(error), true);
    }
  }

  async function removeTheme(theme: ThemeBundle): Promise<void> {
    if (!(await confirmRemove(theme.name))) {
      return;
    }

    try {
      await themeApi.remove(theme.id);

      if (activeId() === theme.id) {
        store.set("theme_id", "");
        setActiveId("");
        themeApi.apply(null);
      }

      await refresh();
    } catch (error) {
      setMessage(String(error), true);
    }
  }

  async function reloadTheme(theme: ThemeBundle): Promise<void> {
    try {
      const reloaded = await themeApi.reload(theme.id);

      if (activeId() === theme.id) {
        themeApi.apply(reloaded);
      }

      await refresh();
      setMessage(`Reloaded ${reloaded.name}.`);
    } catch (error) {
      setMessage(`Could not reload ${theme.name}: ${String(error)}`, true);
      await refresh();
    }
  }

  function show(view: "installed" | "community"): void {
    setActiveTab(view);

    if (view === "community") {
      void loadCommunity();
    }
  }

  onMount(() => {
    ensureStyle(UI_STYLE_ID, themeCSS);
    void refresh();

    const unsubscribeTheme = themeApi.onChange(() => void refresh());
    const unsubscribeId = store.onChange("theme_id", (value) => {
      setActiveId(typeof value === "string" ? value : "");
    });
    const unsubscribeMode = store.onChange("theme_mode", (value) => {
      setMode(typeof value === "string" ? value : "system");
    });

    onCleanup(() => {
      unsubscribeTheme();
      unsubscribeId();
      unsubscribeMode();
    });
  });

  return (
    <>
      <div class="yapmod-theme-tabs" role="tablist" aria-label="Theme collection">
        <button
          classList={{
            btn: true,
            small: true,
            ghost: true,
            "yapmod-theme-tab-active": activeTab() === "installed",
          }}
          type="button"
          role="tab"
          aria-selected={activeTab() === "installed"}
          onClick={() => show("installed")}
        >
          Installed
        </button>
        <button
          classList={{
            btn: true,
            small: true,
            ghost: true,
            "yapmod-theme-tab-active": activeTab() === "community",
          }}
          type="button"
          role="tab"
          aria-selected={activeTab() === "community"}
          onClick={() => show("community")}
        >
          Community
        </button>
      </div>

      <Show when={activeTab() === "installed"}>
        <div class="yapmod-theme-toolbar">
          <Show when={canImport}>
            <button class="btn small" type="button" onClick={() => void importTheme()}>
              Import theme
            </button>
          </Show>
          <button class="btn small ghost" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <Show when={filesystem}>
            <button
              class="btn small ghost"
              type="button"
              onClick={() => void themeApi.openFolder()}
            >
              Open folder
            </button>
          </Show>
        </div>
      </Show>

      <Show when={activeTab() === "community"}>
        <div class="yapmod-theme-community-toolbar">
          <input
            class="input yapmod-theme-search"
            type="search"
            placeholder="Search community themes"
            aria-label="Search community themes"
            value={searchQuery()}
            onInput={(event) => setSearchQuery(event.currentTarget.value)}
          />
          <button
            class="btn small ghost"
            type="button"
            onClick={() => void loadCommunity(true)}
            disabled={communityLoading()}
          >
            Refresh
          </button>
          <button
            class="btn small"
            type="button"
            onClick={() =>
              openExternally(
                "https://ilyeshdz.github.io/yapmod/docs/submit-a-theme/",
              )
            }
          >
            Submit a theme
          </button>
        </div>
      </Show>

      <Show when={activeTab() === "installed"}>
        <div class="yapmod-plugin-grid">
          <InstalledThemeCard
            theme={null}
            active={activeId() === ""}
            onUse={() => select(null)}
          />

          <For each={installedThemes()}>
            {(theme) => (
              <InstalledThemeCard
                theme={theme}
                active={activeId() === theme.id}
                onUse={() => select(theme)}
                onReload={() => void reloadTheme(theme)}
                onRemove={() => void removeTheme(theme)}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={activeTab() === "community"}>
        <div class="yapmod-plugin-grid">
          <Show
            when={filteredCommunity().length > 0}
            fallback={
              <p class="hint">
                {communityThemes().length === 0
                  ? "No community themes have been published yet. Check back later or submit a theme."
                  : "No themes match your search."}
              </p>
            }
          >
            <For each={filteredCommunity()}>
              {(theme) => (
                <CommunityThemeCard
                  theme={theme}
                  installed={installedIds().has(theme.id)}
                  onInstall={() => void installCommunityTheme(theme)}
                />
              )}
            </For>
          </Show>
        </div>
      </Show>

      <div class="field yapmod-theme-field">
        <label for="yapmod-yapmod-themes-theme-mode">Mode</label>
        <Dropdown
          id="yapmod-yapmod-themes-theme-mode"
          value={mode()}
          options={[
            { value: "system", label: "Follow the system" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          onChange={(value) => {
            setMode(value);
            store.set("theme_mode", value);
          }}
          ariaLabel="Mode"
        />
        <span class="hint">
          Used by themes that support both a light and a dark version.
        </span>
      </div>

      <Show when={status().message}>
        <p
          classList={{
            hint: true,
            "yapmod-theme-status": true,
            "yapmod-theme-status-error": status().error,
          }}
        >
          {status().message}
        </p>
      </Show>
    </>
  );
}
