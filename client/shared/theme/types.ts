/**
 * The theme format, as the app sees it.
 *
 * The types come from the Rust side, which reads the same files from disk.
 */

import type { ThemeBundle, ThemeMode } from "../../generated/types";

export type { ThemeBundle, ThemeManifest, ThemeMode } from "../../generated/types";

export type CommunityTheme = {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string | null;
  license: string | null;
  mode: ThemeMode;
  tags: string[];
  previewUrl: string | null;
};

/**
 * The mode a theme ends up in.
 */
export type ResolvedMode = "dark" | "light";
