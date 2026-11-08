import { Show, JSX } from "solid-js";
import type {
  CommunityPlugin,
  PluginManifest,
  YapmodPluginInfo,
} from "../../shared/types";
import type { PackageSource } from "../../components/source-indicator";
import { IconButton } from "../../components/icon-button";
import { PackageCard } from "../../components/package-card";
import { Switch } from "../../components/switch";

/** One plugin in the unified gallery, whether installed or available. */
export type PluginEntry = {
  id: string;
  manifest: PluginManifest;
  source: PackageSource;
  verified: boolean;
  installed: YapmodPluginInfo | null;
  community: CommunityPlugin | null;
};

export type PluginCardProps = {
  entry: PluginEntry;
  /** Returns `false` when the change failed or was cancelled. */
  onInstallChange: (installed: boolean) => Promise<boolean>;
  /** Returns `false` when the plugin could not be enabled or disabled. */
  onEnabledChange: (enabled: boolean) => Promise<boolean>;
  onConfigure: () => void;
  onReload: () => void;
};

/** A plugin card with installation, activation and configuration controls. */
export function PluginCard(props: PluginCardProps): JSX.Element {
  const { manifest } = props.entry;
  const installed = () => props.entry.installed !== null;
  const enabled = () => props.entry.installed?.enabled === true;
  const busy = () => props.entry.installed?.busy === true;
  const meta = () =>
    [manifest.author, manifest.version ? `v${manifest.version}` : null, manifest.license]
      .filter(Boolean)
      .join(" · ");

  return (
    <PackageCard
      name={manifest.name}
      meta={meta()}
      description={manifest.description ?? "No description provided."}
      tags={manifest.tags}
      source={props.entry.source}
      sourceNoun="plugin"
      verified={props.entry.verified}
      actions={
        installed() ? (
          <>
            <Show when={manifest.settings.length > 0}>
              <IconButton
                class="btn small ghost yapmod-package-icon-button"
                iconClass="yapmod-package-action-icon"
                icon="settings"
                size={20}
                strokeWidth={1.9}
                label={`Settings for ${manifest.name}`}
                title="Plugin settings"
                onClick={props.onConfigure}
              />
            </Show>
            <IconButton
              class="btn small ghost yapmod-package-icon-button"
              iconClass="yapmod-package-action-icon"
              icon="refresh"
              size={20}
              strokeWidth={1.9}
              label={`Reload ${manifest.name}`}
              title="Reload the plugin files from disk"
              disabled={busy()}
              onClick={props.onReload}
            />
          </>
        ) : undefined
      }
      controls={
        <>
          <Show when={installed()}>
            <label class="yapmod-package-control">
              <span class="yapmod-package-control-label">Enabled</span>
              <Switch
                checked={enabled()}
                disabled={busy()}
                label={
                  enabled()
                    ? `Disable ${manifest.name}`
                    : `Enable ${manifest.name}`
                }
                onChange={(next) => props.onEnabledChange(next)}
              />
            </label>
          </Show>
          <label class="yapmod-package-control">
            <span class="yapmod-package-control-label">Installed</span>
            <Switch
              checked={installed()}
              disabled={busy()}
              label={
                installed()
                  ? `Uninstall ${manifest.name}`
                  : `Install ${manifest.name}`
              }
              onChange={(next) => props.onInstallChange(next)}
            />
          </label>
        </>
      }
    >
      <Show when={manifest.script}>
        <p class="yapmod-package-card-meta">
          Trusted JavaScript plugin — runs in the Yapper page.
        </p>
      </Show>
      <Show when={props.entry.installed?.error}>
        <p class="yapmod-package-error">{props.entry.installed?.error}</p>
      </Show>
    </PackageCard>
  );
}
