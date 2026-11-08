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
  PluginManifest,
  YapmodPluginInfo,
  YapmodPluginsApi,
} from "../../shared/types";
import type { DropdownOption } from "../../components/dropdown";
import { PackageToolbar } from "../../components/package-toolbar";
import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";
import { PluginCard, type PluginEntry } from "./plugins-card";

type Filter = "all" | "installed" | "available";

const FILTER_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All plugins" },
  { value: "installed", label: "Installed" },
  { value: "available", label: "Not installed" },
];

export type PluginGalleryProps = {
  plugins: YapmodPluginsApi;
  onOpenSettings: (id: string) => void;
};

function buildEntries(
  installed: YapmodPluginInfo[],
  community: CommunityPlugin[],
): PluginEntry[] {
  const communityById = new Map(community.map((plugin) => [plugin.id, plugin]));
  const entries = new Map<string, PluginEntry>();

  for (const plugin of installed) {
    const catalogPlugin = communityById.get(plugin.manifest.id);

    entries.set(plugin.manifest.id, {
      id: plugin.manifest.id,
      manifest: plugin.manifest,
      source: catalogPlugin || plugin.verified ? "community" : "local",
      verified: plugin.verified,
      installed: plugin,
      community: catalogPlugin ?? null,
    });
  }

  for (const plugin of community) {
    if (entries.has(plugin.id)) {
      continue;
    }

    entries.set(plugin.id, {
      id: plugin.id,
      manifest: plugin,
      source: "community",
      verified: plugin.verified,
      installed: null,
      community: plugin,
    });
  }

  return [...entries.values()].sort((left, right) => {
    const installedOrder =
      Number(left.installed === null) - Number(right.installed === null);

    if (installedOrder !== 0) {
      return installedOrder;
    }

    return left.manifest.name.localeCompare(right.manifest.name, undefined, {
      sensitivity: "base",
    });
  });
}

function matchesQuery(entry: PluginEntry, query: string): boolean {
  if (!query) {
    return true;
  }

  const manifest: PluginManifest = entry.manifest;

  return [manifest.name, manifest.author, manifest.description, ...(manifest.tags ?? [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(query));
}

/**
 * The unified plugin gallery.
 *
 * Community and locally installed plugins share one list. Installation and
 * activation are independent switches on each card.
 */
export function PluginGallery(props: PluginGalleryProps): JSX.Element {
  const filesystem = getHost().capabilities.packages === "filesystem";
  const [installed, setInstalled] = createSignal<YapmodPluginInfo[]>(
    props.plugins.list(),
  );
  const [community, setCommunity] = createSignal<CommunityPlugin[]>([]);
  const [communityLoaded, setCommunityLoaded] = createSignal(false);
  const [communityLoading, setCommunityLoading] = createSignal(false);
  const [filter, setFilter] = createSignal<Filter>("all");
  const [query, setQuery] = createSignal("");
  const [status, setStatus] = createSignal({ message: "", error: false });
  const [pending, setPending] = createSignal<Set<string>>(new Set());

  const entries = createMemo(() => buildEntries(installed(), community()));

  const filteredPlugins = createMemo(() => {
    const search = query().trim().toLowerCase();
    const currentFilter = filter();

    return entries().filter((entry) => {
      const isInstalled = entry.installed !== null;

      if (currentFilter === "installed" && !isInstalled) {
        return false;
      }

      if (currentFilter === "available" && isInstalled) {
        return false;
      }

      return matchesQuery(entry, search);
    });
  });

  function setMessage(message: string, error = false): void {
    setStatus({ message, error });
  }

  function syncInstalled(): void {
    setInstalled(props.plugins.list());
  }

  function setPendingState(id: string, value: boolean): void {
    setPending((current) => {
      const next = new Set(current);

      if (value) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  /** Asks before a locally imported plugin is deleted from disk. */
  async function confirmLocalRemoval(name: string): Promise<boolean> {
    const modalApi = getYapmod().modal;

    if (!modalApi) {
      return window.confirm(
        `Uninstall ${name}? Its package files and stored settings will be deleted.`,
      );
    }

    let confirmed = false;
    const modal = modalApi.show({
      title: `Uninstall ${name}?`,
      description:
        "This plugin was imported from a local folder. Its package and stored settings will be removed from this device.",
      buttons: [
        { label: "Cancel", variant: "secondary" },
        {
          label: "Uninstall plugin",
          variant: "danger",
          onClick: () => {
            confirmed = true;
          },
        },
      ],
      autoFocus: true,
    });
    await modal.closed;

    return confirmed;
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

    try {
      const entries = await props.plugins.listCommunity();
      setCommunity(entries);
      setCommunityLoaded(true);
    } catch (error) {
      setMessage(`Could not load community plugins: ${String(error)}`, true);
    } finally {
      setCommunityLoading(false);
    }
  }

  async function refreshAll(): Promise<void> {
    setMessage("Refreshing plugins…");
    await Promise.all([refreshInstalled(), loadCommunity(true)]);

    if (!status().error) {
      setMessage("");
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

  async function turnOn(entry: PluginEntry): Promise<boolean> {
    const info = entry.installed;

    if (info?.enabled) {
      return true;
    }

    if (!info) {
      if (!entry.community) {
        return false;
      }

      try {
        setMessage(`Installing ${entry.manifest.name}…`);
        await props.plugins.installCommunity(entry.community.id);
        syncInstalled();
        setMessage("");
      } catch (error) {
        const message = String(error);

        if (message.toLowerCase().includes("cancelled")) {
          setMessage("Plugin installation cancelled.");
        } else {
          setMessage(
            `Could not install ${entry.manifest.name}: ${message}`,
            true,
          );
        }

        return false;
      }
    }

    const success = await props.plugins.setEnabled(entry.id, true);

    if (!success) {
      setMessage(
        `Could not turn on ${entry.manifest.name}. Review the error on its card.`,
        true,
      );
    }

    syncInstalled();
    return success;
  }

  async function turnOff(entry: PluginEntry): Promise<boolean> {
    if (!entry.installed) {
      return false;
    }

    // Community packages are managed by the catalog and can be installed
    // again at any time. Locally imported packages need one last warning
    // because turning them off deletes the folder from this device.
    if (entry.source === "local") {
      if (!(await confirmLocalRemoval(entry.manifest.name))) {
        return false;
      }
    }

    try {
      await props.plugins.remove(entry.id);
      syncInstalled();
      setMessage("");
      return true;
    } catch (error) {
      setMessage(
        `Could not remove ${entry.manifest.name}: ${String(error)}`,
        true,
      );
      return false;
    }
  }

  async function toggle(entry: PluginEntry, next: boolean): Promise<boolean> {
    if (pending().has(entry.id)) {
      return false;
    }

    setPendingState(entry.id, true);

    try {
      return next ? await turnOn(entry) : await turnOff(entry);
    } finally {
      setPendingState(entry.id, false);
    }
  }

  async function reload(entry: PluginEntry): Promise<void> {
    const info = entry.installed;

    if (!info) {
      return;
    }

    try {
      setMessage(`Reloading ${info.manifest.name}…`);
      const success = await props.plugins.reload(info.manifest.id);

      if (!success) {
        setMessage(
          `Could not reload ${info.manifest.name}. Check the error on its card.`,
          true,
        );
        return;
      }

      const current = props.plugins
        .list()
        .find((item) => item.manifest.id === info.manifest.id);
      setMessage(
        current?.enabled
          ? `Reloaded ${info.manifest.name}.`
          : `Reloaded ${info.manifest.name}. Enable it to apply the new files.`,
      );
    } catch (error) {
      setMessage(`Could not reload plugin: ${String(error)}`, true);
    } finally {
      syncInstalled();
    }
  }

  onMount(() => {
    const unsubscribe = props.plugins.onChange(syncInstalled);
    onCleanup(unsubscribe);
    void refreshInstalled();
    void loadCommunity();
  });

  return (
    <>
      <PackageToolbar
        query={query()}
        onQueryChange={setQuery}
        filter={filter()}
        filterOptions={FILTER_OPTIONS}
        onFilterChange={(value) => setFilter(value as Filter)}
        placeholder="Search all plugins"
      >
        <button class="btn small" type="button" onClick={() => void importLocal()}>
          Import plugin
        </button>
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
            onClick={() =>
              void props.plugins
                .openFolder()
                .catch((error: unknown) => setMessage(String(error), true))
            }
          >
            Open folder
          </button>
        </Show>
        <button
          class="btn small ghost"
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
      </PackageToolbar>

      <div class="yapmod-package-grid">
        <Show
          when={filteredPlugins().length > 0}
          fallback={
            <p class="hint">
              {query().trim()
                ? "No plugins match your search."
                : filter() === "available"
                  ? communityLoading()
                    ? "Loading community plugins…"
                    : "No community plugins are available right now."
                  : "No plugins installed yet. Import a folder or browse the community catalog."}
            </p>
          }
        >
          <For each={filteredPlugins()}>
            {(entry) => (
              <PluginCard
                entry={entry}
                pending={pending().has(entry.id)}
                onToggle={(next) => toggle(entry, next)}
                onConfigure={() => props.onOpenSettings(entry.id)}
                onReload={() => void reload(entry)}
              />
            )}
          </For>
        </Show>
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
