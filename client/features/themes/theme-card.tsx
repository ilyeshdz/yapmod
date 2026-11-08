import type { JSX } from "solid-js";
import type { PackageSource } from "../../components/source-indicator";
import { IconButton } from "../../components/icon-button";
import { PackageCard } from "../../components/package-card";
import { Switch } from "../../components/switch";
import type { CommunityTheme, ThemeBundle } from "./types";

type ThemeMeta = {
  mode?: string | null;
  author?: string | null;
  version?: string | null;
  license?: string | null;
};

/** One theme in the unified gallery, whether installed, local or remote. */
export type ThemeEntry = {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string | null;
  license: string | null;
  mode: string;
  tags: string[];
  source: PackageSource;
  installed: ThemeBundle | null;
  community: CommunityTheme | null;
  builtin?: boolean;
};

function describe(theme: ThemeMeta): string {
  return [theme.mode, theme.author, theme.version, theme.license]
    .filter(Boolean)
    .join(" · ");
}

export type ThemeCardProps = {
  entry: ThemeEntry;
  active: boolean;
  onSelect: () => void;
  /** Returns `false` when the change failed or was cancelled. */
  onInstallChange: (installed: boolean) => Promise<boolean>;
  onReload?: () => void;
};

/** A theme card with installation and selection controls. */
export function ThemeCard(props: ThemeCardProps): JSX.Element {
  const installed = () => props.entry.builtin === true || props.entry.installed !== null;
  const meta = () =>
    props.entry.builtin
      ? "the look the app ships with"
      : describe(props.entry);

  return (
    <PackageCard
      name={props.entry.name}
      meta={meta()}
      description={
        props.entry.description ??
        (props.entry.builtin
          ? "The app's own palette, typography and spacing."
          : "No description provided.")
      }
      tags={props.entry.tags}
      source={props.entry.source}
      sourceNoun="theme"
      active={props.active}
      actions={
        props.entry.installed && props.onReload ? (
          <IconButton
            class="btn small ghost yapmod-package-icon-button"
            iconClass="yapmod-package-action-icon"
            icon="refresh"
            size={20}
            strokeWidth={1.9}
            label={`Reload ${props.entry.name}`}
            title={`Reload ${props.entry.name} from disk`}
            onClick={() => props.onReload?.()}
          />
        ) : undefined
      }
      controls={
        <>
          {installed() ? (
            <button
              class="btn small ghost"
              type="button"
              disabled={props.active}
              aria-pressed={props.active}
              onClick={props.onSelect}
            >
              {props.active ? "Active" : "Use"}
            </button>
          ) : null}
          {props.entry.builtin ? null : (
            <label class="yapmod-package-control">
              <span class="yapmod-package-control-label">Installed</span>
              <Switch
                checked={installed()}
                label={
                  installed()
                    ? `Uninstall ${props.entry.name}`
                    : `Install ${props.entry.name}`
                }
                onChange={(next) => props.onInstallChange(next)}
              />
            </label>
          )}
        </>
      }
    />
  );
}
