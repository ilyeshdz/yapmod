import { JSX, Show } from "solid-js";
import type { YapmodPluginInfo, CommunityPlugin } from "../../shared/types";
import { Icon } from "../../components/icon";
import { IconButton } from "../../components/icon-button";

/** Badge shown on plugins the catalog owners reviewed and verified. */
function VerifiedBadge(): JSX.Element {
  return (
    <span
      class="yapmod-plugin-verified"
      title="Reviewed and verified by the Yapmod maintainers"
    >
      <Icon
        class="yapmod-plugin-verified-icon"
        size={13}
        strokeWidth={2.6}
        name="check"
      />
      Verified
    </span>
  );
}

export type InstalledPluginCardProps = {
  plugin: YapmodPluginInfo;
  onToggle: () => void;
  onReload: () => void;
  onRemove: () => void;
  onSettings: () => void;
  onInspect: () => void;
};

/** Card for an installed plugin with enable/disable, settings, and remove actions. */
export function InstalledPluginCard(props: InstalledPluginCardProps): JSX.Element {
  const { manifest } = props.plugin;
  return (
    <article class="yapmod-plugin-card">
      <div class="yapmod-plugin-card-body">
        <div class="yapmod-plugin-card-title-row">
          <div class="yapmod-plugin-card-heading">
            <h3 class="yapmod-plugin-card-name">{manifest.name}</h3>
            <Show when={props.plugin.verified}><VerifiedBadge /></Show>
          </div>
          <span classList={{
            "yapmod-plugin-state": true,
            "yapmod-plugin-state-active": props.plugin.enabled,
          }}>
            {props.plugin.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p class="yapmod-plugin-card-meta">
          {[manifest.author, manifest.version ? `v${manifest.version}` : null].filter(Boolean).join(" · ")}
        </p>
        <p class="yapmod-plugin-card-description">
          {manifest.description ?? "No description provided."}
        </p>
        {manifest.script && (
          <p>
            Trusted JavaScript plugin — runs in the Yapper page.
          </p>
        )}
        {props.plugin.error && (
          <p class="yapmod-plugin-error">{props.plugin.error}</p>
        )}
      </div>
      <div class="yapmod-plugin-card-foot">
        <div class="yapmod-plugin-card-actions">
          {manifest.settings.length > 0 && (
            <IconButton
              class="btn small ghost yapmod-plugin-icon-button"
              iconClass="yapmod-plugin-action-icon"
              icon="settings"
              size={22}
              strokeWidth={1.9}
              label={`Settings for ${manifest.name}`}
              title="Plugin settings"
              onClick={props.onSettings}
            />
          )}
          <IconButton
            class="btn small ghost yapmod-plugin-icon-button"
            iconClass="yapmod-plugin-action-icon"
            icon="files"
            size={22}
            strokeWidth={1.9}
            label={`View files for ${manifest.name}`}
            title="View plugin files"
            onClick={props.onInspect}
          />
          <IconButton
            class="btn small ghost yapmod-plugin-icon-button"
            iconClass="yapmod-plugin-action-icon"
            icon="refresh"
            size={22}
            strokeWidth={1.9}
            label={`Reload ${manifest.name}`}
            title="Reload the plugin files from disk"
            disabled={props.plugin.busy}
            onClick={props.onReload}
          />
          <IconButton
            class="btn small ghost yapmod-plugin-icon-button"
            iconClass="yapmod-plugin-action-icon"
            icon="trash"
            size={22}
            strokeWidth={1.9}
            label={`Remove ${manifest.name}`}
            title="Remove plugin"
            onClick={props.onRemove}
          />
        </div>
        <button
          class="btn small ghost"
          type="button"
          disabled={props.plugin.busy}
          onClick={props.onToggle}
        >
          {props.plugin.busy ? "Working…" : props.plugin.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </article>
  );
}

export type CommunityPluginCardProps = {
  plugin: CommunityPlugin;
  installed: boolean;
  onInstall: () => void;
};

/** Card for a community plugin with an install button. */
export function CommunityPluginCard(props: CommunityPluginCardProps): JSX.Element {
  return (
    <article class="yapmod-plugin-card">
      <div class="yapmod-plugin-card-body">
        <div class="yapmod-plugin-card-title-row">
          <div class="yapmod-plugin-card-heading">
            <h3 class="yapmod-plugin-card-name">{props.plugin.name}</h3>
            <Show when={props.plugin.verified}><VerifiedBadge /></Show>
          </div>
        </div>
        <p class="yapmod-plugin-card-meta">
          {[props.plugin.author, props.plugin.version ? `v${props.plugin.version}` : null, props.plugin.license].filter(Boolean).join(" · ")}
        </p>
        <p class="yapmod-plugin-card-description">
          {props.plugin.description ?? "No description provided."}
        </p>
        {props.plugin.tags?.length > 0 && (
          <div class="yapmod-plugin-tags">
            {props.plugin.tags.map((tag) => (
              <span class="yapmod-plugin-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div class="yapmod-plugin-card-foot">
        <button
          class="btn small yapmod-plugin-install"
          type="button"
          disabled={props.installed}
          onClick={props.onInstall}
        >
          {props.installed ? "Installed" : "Install"}
        </button>
      </div>
    </article>
  );
}
