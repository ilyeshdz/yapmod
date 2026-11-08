import type { ReleaseEntry } from "../../shared/types";
import { getHost } from "../../platform/host";

let changelogCache: ReleaseEntry[] | null = null;

/**
 * Every release, newest first.
 *
 * The list is fetched on demand and kept around, so it is not shipped with
 * every page load.
 */
export async function getChangelog(): Promise<ReleaseEntry[]> {
  if (!changelogCache) {
    changelogCache = (await getHost().release?.changelog()) ?? [];
  }

  return changelogCache;
}

