import { For, Show, JSX } from "solid-js";

import type {
  ReleaseEntry,
  ReleaseNotes,
  ReleaseNotesSection,
} from "../../shared/types";
import { formatReleaseDate } from "./release";

/** One "Highlights"/"New"/"Fixed" block of a release. */
export function ReleaseSection(
  props: { section: ReleaseNotesSection },
): JSX.Element {
  return (
    <section class="yapmod-release-section">
      <Show when={props.section.heading}>
        <h3>{props.section.heading}</h3>
      </Show>
      <ul class="yapmod-release-list">
        <For each={props.section.items}>{(item) => <li>{item}</li>}</For>
      </ul>
    </section>
  );
}

/** The summary and the sections of a release. */
export function ReleaseBody(
  props: { notes: ReleaseNotes | null; fallbackSummary?: string },
): JSX.Element {
  return (
    <div class="yapmod-release-body">
      <Show when={props.notes?.summary ?? props.fallbackSummary}>
        <p class="yapmod-release-summary">
          {props.notes?.summary ?? props.fallbackSummary}
        </p>
      </Show>
      <For each={props.notes?.sections ?? []}>
        {(section) => <ReleaseSection section={section} />}
      </For>
    </div>
  );
}

function ChangelogRelease(
  props: { release: ReleaseEntry; installedVersion?: string },
): JSX.Element {
  const date = () => formatReleaseDate(props.release.notes?.date);
  const current = () => props.release.version === props.installedVersion;

  return (
    <article class="yapmod-changelog-release">
      <header class="yapmod-changelog-header">
        <div class="toggle-label">Version {props.release.version}</div>
        <Show when={date() || current()}>
          <div class="yapmod-changelog-meta">
            <Show when={date()}>
              <span class="hint">{date()}</span>
            </Show>
            <Show when={current()}>
              <span class="hint">Current version</span>
            </Show>
          </div>
        </Show>
      </header>
      <Show when={props.release.notes?.title}>
        <h3 class="yapmod-changelog-title">{props.release.notes?.title}</h3>
      </Show>
      <ReleaseBody notes={props.release.notes ?? null} />
    </article>
  );
}

/** Every release, newest first. */
export function ChangelogList(
  props: { releases: ReleaseEntry[]; installedVersion?: string },
): JSX.Element {
  return (
    <Show
      when={props.releases.length > 0}
      fallback={<p class="yapmod-changelog-empty">No releases yet.</p>}
    >
      <For each={props.releases}>
        {(release) => (
          <ChangelogRelease
            release={release}
            installedVersion={props.installedVersion}
          />
        )}
      </For>
    </Show>
  );
}
