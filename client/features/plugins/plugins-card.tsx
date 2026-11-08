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
  /** True while the plugin is being installed, enabled or removed. */
  pending: boolean;
  /** Turns the plugin on or off. Returns `false` when the change failed. */
  onToggle: (enabled: boolean) => Promise<boolean>;
  onConfigure: () => void;
  onReload: () => void;
};

/**
 * A plugin card with a single on/off switch.
 *
 * Turning the switch on installs the package when needed and enables it;
 * turning it off disables and removes it. Configuration stays available for
 * installed plugins.
 */
export function PluginCard(props: PluginCardProps): JSX.Element {
  const { manifest } = props.entry;
  const installed = () => props.entry.installed !== null;
  const enabled = () => props.entry.installed?.enabled === true;
  const busy = () => props.pending || props.entry.installed?.busy === true;
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
      active={enabled()}
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
        <label class="yapmod-package-control">
          <Switch
            checked={enabled()}
            disabled={busy()}
            label={
              enabled()
                ? `Turn off ${manifest.name}`
                : `Turn on ${manifest.name}`
            }
            onChange={(next) => props.onToggle(next)}
          />
        </label>
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
