import type { ReleaseEntry } from "../../shared/types";
import { invokeCommand } from "../../core/tauri";

let changelogCache: ReleaseEntry[] | null = null;

/**
 * Every release, newest first.
 *
 * The list is fetched on demand and kept around, so it is not shipped with
 * every page load.
 */
export async function getChangelog(): Promise<ReleaseEntry[]> {
  if (!changelogCache) {
    changelogCache = await invokeCommand<ReleaseEntry[]>("get_changelog");
  }

  return changelogCache;
}

/** Formats an ISO date (YYYY-MM-DD) as a human readable date. */
export function formatReleaseDate(
  date: string | null | undefined,
): string | null {
  if (!date) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
