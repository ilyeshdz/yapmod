import { JSX, Show } from "solid-js";
import type { CommunityTheme, ThemeBundle } from "./types";
import { IconButton } from "../../components/icon-button";

type ThemeMeta = {
  mode?: string | null;
  author?: string | null;
  version?: string | null;
  license?: string | null;
};

function describe(theme: ThemeMeta): string {
  return [theme.mode, theme.author, theme.version, theme.license]
    .filter(Boolean)
    .join(" · ");
}

export type InstalledThemeCardProps = {
  /** The installed theme, or `null` for the app's own theme. */
  theme: ThemeBundle | null;
  active: boolean;
  onUse: () => void;
  onReload?: () => void;
  onRemove?: () => void;
};

/** A theme card with the same layout as an installed plugin card. */
export function InstalledThemeCard(
  props: InstalledThemeCardProps,
): JSX.Element {
  const name = () => props.theme?.name ?? "Yapin's theme";
  const meta = () =>
    props.theme ? describe(props.theme) : "the look the app ships with";
  const description = () =>
    props.theme?.description ??
    "The app's own palette, typography and spacing.";
  const tags = () => props.theme?.tags ?? [];

  return (
    <article class="yapmod-plugin-card">
      <div class="yapmod-plugin-card-body">
        <div class="yapmod-plugin-card-title-row">
          <div class="yapmod-plugin-card-heading">
            <h3 class="yapmod-plugin-card-name">{name()}</h3>
          </div>
          <Show when={props.active}>
            <span class="yapmod-plugin-state yapmod-plugin-state-active">
              Active
            </span>
          </Show>
        </div>
        <p class="yapmod-plugin-card-meta">{meta()}</p>
        <p class="yapmod-plugin-card-description">{description()}</p>
        <Show when={tags().length > 0}>
          <div class="yapmod-plugin-tags">
            {tags().map((tag) => (
              <span class="yapmod-plugin-tag">{tag}</span>
            ))}
          </div>
        </Show>
      </div>
      <div class="yapmod-plugin-card-foot">
        <div class="yapmod-plugin-card-actions">
          <Show when={props.theme}>
            <IconButton
              class="btn small ghost yapmod-plugin-icon-button"
              iconClass="yapmod-plugin-action-icon"
              icon="refresh"
              size={22}
              strokeWidth={1.9}
              label={`Reload the theme ${name()}`}
              title={`Reload ${name()} from disk`}
              onClick={() => props.onReload?.()}
            />
            <IconButton
              class="btn small ghost yapmod-plugin-icon-button"
              iconClass="yapmod-plugin-action-icon"
              icon="trash"
              size={22}
              strokeWidth={1.9}
              label={`Remove the theme ${name()}`}
              title={`Remove ${name()}`}
              onClick={() => props.onRemove?.()}
            />
          </Show>
        </div>
        <button
          class="btn small ghost"
          type="button"
          disabled={props.active}
          aria-pressed={props.active}
          onClick={props.onUse}
        >
          {props.active ? "Active" : "Use"}
        </button>
      </div>
    </article>
  );
}

export type CommunityThemeCardProps = {
  theme: CommunityTheme;
  installed: boolean;
  onInstall: () => void;
};

/** A community theme card with the same layout as a community plugin card. */
export function CommunityThemeCard(
  props: CommunityThemeCardProps,
): JSX.Element {
  return (
    <article class="yapmod-plugin-card">
      <div class="yapmod-plugin-card-body">
        <div class="yapmod-plugin-card-title-row">
          <div class="yapmod-plugin-card-heading">
            <h3 class="yapmod-plugin-card-name">{props.theme.name}</h3>
          </div>
        </div>
        <p class="yapmod-plugin-card-meta">{describe(props.theme)}</p>
        <p class="yapmod-plugin-card-description">
          {props.theme.description ?? "No description provided."}
        </p>
        <Show when={props.theme.tags.length > 0}>
          <div class="yapmod-plugin-tags">
            {props.theme.tags.map((tag) => (
              <span class="yapmod-plugin-tag">{tag}</span>
            ))}
          </div>
        </Show>
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
