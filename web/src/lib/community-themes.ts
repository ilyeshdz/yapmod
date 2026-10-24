import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type CommunityThemeEntry = {
  id: string;
  name: string;
  author: string | null;
  preview: string;
};

/** Read the same source manifests that the website build publishes in its catalog. */
export function getCommunityThemes(): CommunityThemeEntry[] {
  const source = resolve(process.cwd(), "../community-themes");

  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const manifest = JSON.parse(
        readFileSync(resolve(source, entry.name, "manifest.json"), "utf8"),
      ) as Partial<CommunityThemeEntry>;

      return {
        id: entry.name,
        name: typeof manifest.name === "string" ? manifest.name : entry.name,
        author: typeof manifest.author === "string" ? manifest.author : null,
        preview: typeof manifest.preview === "string" ? manifest.preview : "",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
