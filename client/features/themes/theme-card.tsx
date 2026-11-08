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
  /** Applies or turns off the theme. Returns `false` when the change failed. */
  onActiveChange: (active: boolean) => Promise<boolean>;
  onReload?: () => void;
};

/**
 * A theme card whose switch applies the theme.
 *
 * The switch reflects the active theme, not installation: turning it on
 * installs a community theme in the background when needed, and turning it
 * off returns to the app's own theme without deleting anything.
 */
export function ThemeCard(props: ThemeCardProps): JSX.Element {
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
        <label class="yapmod-package-control">
          <Switch
            checked={props.active}
            label={
              props.active
                ? `Turn off ${props.entry.name}`
                : `Apply ${props.entry.name}`
            }
            onChange={(next) => props.onActiveChange(next)}
          />
        </label>
      }
    />
  );
}
