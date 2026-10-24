import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  JSX,
} from "solid-js";

import type {
  CommunityPlugin,
  YapmodPluginInfo,
  YapmodPluginsApi,
} from "../../shared/types";
import {
  CommunityPluginCard,
  InstalledPluginCard,
} from "./plugins-card";

type View = "installed" | "community";

export type PluginGalleryProps = {
  plugins: YapmodPluginsApi;
  onOpenSettings: (id: string) => void;
  onOpenFiles: (id: string) => void;
};

/**
 * The Installed / Community plugin gallery.
 *
 * State lives in signals; the plugin registry stays the source of truth and
 * notifies this component when plugins change from somewhere else.
 */
export function PluginGallery(props: PluginGalleryProps): JSX.Element {
  const [installed, setInstalled] = createSignal<YapmodPluginInfo[]>(
    props.plugins.list(),
  );
  const [community, setCommunity] = createSignal<CommunityPlugin[]>([]);
  const [communityLoaded, setCommunityLoaded] = createSignal(false);
  const [communityLoading, setCommunityLoading] = createSignal(false);
  const [view, setView] = createSignal<View>("installed");
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal({ message: "", error: false });

  const installedIds = createMemo(
    () => new Set(installed().map((plugin) => plugin.manifest.id)),
  );

  const filteredCommunity = createMemo(() => {
    const search = query().trim().toLowerCase();

    if (!search) {
      return community();
    }

    return community().filter((plugin) =>
      [plugin.name, plugin.author, plugin.description, ...(plugin.tags ?? [])]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search)),
    );
  });

  function setMessage(message: string, error = false): void {
    setStatus({ message, error });
  }

  function syncInstalled(): void {
    setInstalled(props.plugins.list());
  }

  async function refreshInstalled(): Promise<void> {
    try {
      await props.plugins.refreshInstalled();
      syncInstalled();
    } catch (error) {
      setMessage(`Could not refresh installed plugins: ${String(error)}`, true);
    }
  }

  async function loadCommunity(force = false): Promise<void> {
    if (communityLoading() || (communityLoaded() && !force)) {
      return;
    }

    setCommunityLoading(true);
    setMessage("Loading community plugins…");

    try {
      const entries = await props.plugins.listCommunity();
      setCommunity(entries);
      setCommunityLoaded(true);
      setMessage(
        `${entries.length} community plugin${entries.length === 1 ? "" : "s"} available.`,
      );
    } catch (error) {
      setMessage(`Could not load community plugins: ${String(error)}`, true);
    } finally {
      setCommunityLoading(false);
    }
  }

  async function importLocal(): Promise<void> {
    try {
      setMessage("Choose a plugin folder…");
      const manifest = await props.plugins.importLocal();

      if (!manifest) {
        setMessage("Plugin import cancelled.");
        return;
      }

      setMessage(`Imported ${manifest.name}.`);
      await refreshInstalled();
    } catch (error) {
      setMessage(`Could not import plugin: ${String(error)}`, true);
    }
  }

  async function installCommunity(plugin: CommunityPlugin): Promise<void> {
    try {
      setMessage(`Installing ${plugin.name}…`);
      await props.plugins.installCommunity(plugin.id);
      setMessage(`Installed ${plugin.name}.`);
      await refreshInstalled();
    } catch (error) {
      setMessage(`Could not install ${plugin.name}: ${String(error)}`, true);
    }
  }

  async function toggle(plugin: YapmodPluginInfo): Promise<void> {
    const success = await props.plugins.setEnabled(
      plugin.manifest.id,
      !plugin.enabled,
    );

    if (!success && !plugin.enabled) {
      setMessage(
        "The plugin was not enabled. Review the warning or check the error on its card.",
        true,
      );
    }

    syncInstalled();
  }

  async function remove(plugin: YapmodPluginInfo): Promise<void> {
    if (
      !window.confirm(
        `Remove ${plugin.manifest.name}? Its package files will be deleted from the plugins folder.`,
      )
    ) {
      return;
    }

    try {
      await props.plugins.remove(plugin.manifest.id);
      setMessage(`Removed ${plugin.manifest.name}.`);
      syncInstalled();
    } catch (error) {
      setMessage(`Could not remove plugin: ${String(error)}`, true);
    }
  }

  function show(next: View): void {
    setView(next);

    if (next === "community") {
      void loadCommunity();
    }
  }

  onMount(() => {
    const unsubscribe = props.plugins.onChange(syncInstalled);
    onCleanup(unsubscribe);
    void refreshInstalled();
  });

  return (
    <>
      <div class="yapmod-theme-tabs" role="tablist" aria-label="Plugin collection">
        <button
          classList={{
            btn: true,
            small: true,
            ghost: true,
            "yapmod-theme-tab-active": view() === "installed",
          }}
          type="button"
          role="tab"
          aria-selected={view() === "installed"}
          onClick={() => show("installed")}
        >
          Installed
        </button>
        <button
          classList={{
            btn: true,
            small: true,
            ghost: true,
            "yapmod-theme-tab-active": view() === "community",
          }}
          type="button"
          role="tab"
          aria-selected={view() === "community"}
          onClick={() => show("community")}
        >
          Community
        </button>
      </div>

      <Show when={view() === "installed"}>
        <div class="yapmod-plugin-toolbar">
          <button class="btn small" type="button" onClick={() => void importLocal()}>
            Import plugin
          </button>
          <button
            class="btn small ghost"
            type="button"
            onClick={() => void refreshInstalled()}
          >
            Refresh
          </button>
          <button
            class="btn small ghost"
            type="button"
            onClick={() =>
              void props.plugins
                .openFolder()
                .catch((error: unknown) => setMessage(String(error), true))
            }
          >
            Open folder
          </button>
        </div>
      </Show>

      <Show when={view() === "community"}>
        <div class="yapmod-plugin-toolbar">
          <input
            class="input yapmod-plugin-search"
            type="search"
            placeholder="Search community plugins"
            aria-label="Search community plugins"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
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
              window.open(
                "https://ilyeshdz.github.io/yapmod/docs/submit-a-plugin/",
                "_blank",
                "noopener",
              )
            }
          >
            Submit a plugin
          </button>
        </div>
      </Show>

      <Show when={view() === "installed"}>
        <div class="yapmod-plugin-grid">
          <Show
            when={installed().length > 0}
            fallback={
              <p class="hint">
                No plugins installed yet. Import a folder or browse Community.
              </p>
            }
          >
            <For each={installed()}>
              {(plugin) => (
                <InstalledPluginCard
                  plugin={plugin}
                  onToggle={() => void toggle(plugin)}
                  onRemove={() => void remove(plugin)}
                  onSettings={() => props.onOpenSettings(plugin.manifest.id)}
                  onInspect={() => props.onOpenFiles(plugin.manifest.id)}
                />
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={view() === "community"}>
        <div class="yapmod-plugin-grid">
          <Show
            when={filteredCommunity().length > 0}
            fallback={
              <p class="hint">
                {community().length
                  ? "No community plugins match this search."
                  : "No community plugins are published yet."}
              </p>
            }
          >
            <For each={filteredCommunity()}>
              {(plugin) => (
                <CommunityPluginCard
                  plugin={plugin}
                  installed={installedIds().has(plugin.id)}
                  onInstall={() => void installCommunity(plugin)}
                />
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={status().message}>
        <p
          classList={{
            hint: true,
            "yapmod-plugin-status": true,
            "yapmod-plugin-status-error": status().error,
          }}
          aria-live="polite"
        >
          {status().message}
        </p>
      </Show>
    </>
  );
}
