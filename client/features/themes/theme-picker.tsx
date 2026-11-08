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
import type { DropdownOption } from "../../components/dropdown";
import { Dropdown } from "../../components/dropdown";
import { PackageToolbar } from "../../components/package-toolbar";
import { openExternally } from "../../core/links";
import { getHost } from "../../platform/host";
import { ensureStyle } from "../../shared/ui";
import themeCSS from "../../styles/themes.css";
import { ThemeCard, type ThemeEntry } from "./theme-card";

const UI_STYLE_ID = "yapmod-theme-ui-styles";

type Filter = "all" | "installed" | "available";

const FILTER_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All themes" },
  { value: "installed", label: "Installed" },
  { value: "available", label: "Not installed" },
];

export type ThemePickerProps = {
  themeApi: YapmodThemeApi;
  store: YapmodStoreApi;
};

function buildEntries(
  installed: ThemeBundle[],
  community: CommunityTheme[],
): ThemeEntry[] {
  const communityById = new Map(community.map((theme) => [theme.id, theme]));
  const entries = new Map<string, ThemeEntry>();

  for (const theme of installed) {
    const catalogTheme = communityById.get(theme.id);

    entries.set(theme.id, {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      author: theme.author,
      version: theme.version,
      license: theme.license,
      mode: theme.mode,
      tags: theme.tags,
      source: catalogTheme ? "community" : "local",
      installed: theme,
      community: catalogTheme ?? null,
    });
  }

  for (const theme of community) {
    if (entries.has(theme.id)) {
      continue;
    }

    entries.set(theme.id, {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      author: theme.author,
      version: theme.version,
      license: theme.license,
      mode: theme.mode,
      tags: theme.tags,
      source: "community",
      installed: null,
      community: theme,
    });
  }

  // Installed themes are the ones users are most likely to manage, so they
  // lead the list. The app's own theme always comes first.
  const rest = [...entries.values()].sort((left, right) => {
    const installedOrder = Number(left.installed === null) - Number(right.installed === null);

    if (installedOrder !== 0) {
      return installedOrder;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  });

  return [
    {
      id: "",
      name: "Yapper's theme",
      description: "The app's own palette, typography and spacing.",
      author: null,
      version: null,
      license: null,
      mode: "",
      tags: [],
      source: "builtin",
      installed: null,
      community: null,
      builtin: true,
    },
    ...rest,
  ];
}

function matchesQuery(entry: ThemeEntry, query: string): boolean {
  if (!query) {
    return true;
  }

  return [entry.name, entry.author, entry.description, entry.mode, ...entry.tags]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(query));
}

/**
 * The unified theme gallery, rendered inside the host settings panel.
 *
 * Community and locally installed themes share one list; installation state
 * is a switch on each card instead of two separate tabs.
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
  const [filter, setFilter] = createSignal<Filter>("all");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeId, setActiveId] = createSignal(
    store.get<string>("theme_id", "") ?? "",
  );
  const [mode, setMode] = createSignal(
    store.get<string>("theme_mode", "system") ?? "system",
  );
  const [status, setStatus] = createSignal({ message: "", error: false });

  const entries = createMemo(() =>
    buildEntries(installedThemes(), communityThemes()),
  );

  const filteredThemes = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    const currentFilter = filter();

    return entries().filter((entry) => {
      const installed = entry.builtin === true || entry.installed !== null;

      if (currentFilter === "installed" && !installed) {
        return false;
      }

      if (currentFilter === "available" && installed) {
        return false;
      }

      return matchesQuery(entry, query);
    });
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

    try {
      const themes = await themeApi.listCommunity();
      setCommunityThemes(themes);
      setCommunityLoaded(true);
    } catch (error) {
      setMessage(`Could not load community themes: ${String(error)}`, true);
    } finally {
      setCommunityLoading(false);
    }
  }

  async function refreshAll(): Promise<void> {
    setMessage("Refreshing themes…");
    await Promise.all([refresh(), loadCommunity(true)]);

    if (!status().error) {
      setMessage("");
    }
  }

  async function setActiveState(
    entry: ThemeEntry,
    next: boolean,
  ): Promise<boolean> {
    if (!next) {
      // The app's own theme cannot be turned off, and switching off a theme
      // that is not active is a no-op. Turning a theme off only stops
      // applying it; the files stay on disk.
      if (entry.builtin || activeId() !== entry.id) {
        return false;
      }

      select(null);
      setMessage("");
      return true;
    }

    if (entry.builtin) {
      select(null);
      setMessage("");
      return true;
    }

    if (activeId() === entry.id) {
      return true;
    }

    let theme = entry.installed;

    if (!theme) {
      if (!entry.community) {
        return false;
      }

      try {
        setMessage(`Installing ${entry.name}…`);
        await themeApi.installCommunity(entry.community.id);
        const themes = await themeApi.list();
        setInstalledThemes(themes);
        theme = themes.find((item) => item.id === entry.id) ?? null;

        if (!theme) {
          throw new Error("the installed theme could not be found");
        }
      } catch (error) {
        setMessage(`Could not apply ${entry.name}: ${String(error)}`, true);
        return false;
      }
    }

    select(theme);
    setMessage("");
    return true;
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

  onMount(() => {
    ensureStyle(UI_STYLE_ID, themeCSS);
    void refresh();
    void loadCommunity();

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
      <PackageToolbar
        query={searchQuery()}
        onQueryChange={setSearchQuery}
        filter={filter()}
        filterOptions={FILTER_OPTIONS}
        onFilterChange={(value) => setFilter(value as Filter)}
        placeholder="Search all themes"
      >
        <Show when={canImport}>
          <button class="btn small" type="button" onClick={() => void importTheme()}>
            Import theme
          </button>
        </Show>
        <button
          class="btn small ghost"
          type="button"
          onClick={() => void refreshAll()}
          disabled={communityLoading()}
        >
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
        <button
          class="btn small ghost"
          type="button"
          onClick={() =>
            openExternally(
              "https://ilyeshdz.github.io/yapmod/docs/submit-a-theme/",
            )
          }
        >
          Submit a theme
        </button>
      </PackageToolbar>

      <div class="yapmod-package-grid">
        <Show
          when={filteredThemes().length > 0}
          fallback={
            <p class="hint">
              {searchQuery().trim()
                ? "No themes match your search."
                : filter() === "available"
                  ? communityLoading()
                    ? "Loading community themes…"
                    : "No community themes are available right now."
                  : "No themes installed yet."}
            </p>
          }
        >
          <For each={filteredThemes()}>
            {(entry) => (
              <ThemeCard
                entry={entry}
                active={activeId() === entry.id}
                onActiveChange={(next) => setActiveState(entry, next)}
                onReload={
                  entry.installed
                    ? () => void reloadTheme(entry.installed!)
                    : undefined
                }
              />
            )}
          </For>
        </Show>
      </div>

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
            "yapmod-package-status": true,
            "yapmod-package-status-error": status().error,
          }}
          aria-live="polite"
        >
          {status().message}
        </p>
      </Show>
    </>
  );
}
