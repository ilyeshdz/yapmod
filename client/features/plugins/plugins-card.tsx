import { JSX } from "solid-js";
import type { YapmodPluginInfo, CommunityPlugin } from "../../shared/types";
import { Icon } from "../../components/icon";

const PLUGIN_ICON_PATHS = {
  settings: [
    "M4 6h16M4 12h16M4 18h16",
    "M9 4v4M15 10v4M11 16v4",
  ],
  files: [
    "M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5Z",
    "M14 2.5v6h6",
    "M8 13h8M8 17h6",
  ],
} as const;

export type InstalledPluginCardProps = {
  plugin: YapmodPluginInfo;
  onToggle: () => void;
  onRemove: () => void;
  onSettings: () => void;
  onInspect: () => void;
};

/** Card for an installed plugin with enable/disable, settings, and remove actions. */
export function InstalledPluginCard(props: InstalledPluginCardProps): JSX.Element {
  const { manifest } = props.plugin;
  return (
    <article classList={{
      "yapmod-plugin-card": true,
      "yapmod-plugin-active": props.plugin.enabled,
    }}>
      <div class="yapmod-plugin-card-body">
        <div class="yapmod-plugin-card-title-row">
          <h3 class="yapmod-plugin-card-name">{manifest.name}</h3>
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
          <p class="yapmod-plugin-warning">
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
            <button
              class="btn small ghost yapmod-plugin-icon-button"
              type="button"
              aria-label={`Settings for ${manifest.name}`}
              title="Plugin settings"
              onClick={props.onSettings}
            >
              <Icon class="yapmod-plugin-action-icon" size={22} strokeWidth={1.9} paths={[PLUGIN_ICON_PATHS.settings]} />
            </button>
          )}
          <button
            class="btn small ghost yapmod-plugin-icon-button"
            type="button"
            aria-label={`View files for ${manifest.name}`}
            title="View plugin files"
            onClick={props.onInspect}
          >
            <Icon class="yapmod-plugin-action-icon" size={22} strokeWidth={1.9} paths={[PLUGIN_ICON_PATHS.files]} />
          </button>
          <button class="btn small ghost" type="button" onClick={props.onRemove}>
            Remove
          </button>
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
          <h3 class="yapmod-plugin-card-name">{props.plugin.name}</h3>
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
