import type { CollectionEntry } from "astro:content";

/** The sidebar sections, in the order they should appear. */
export const docGroups = ["Start", "Themes", "Plugins", "Contributing"] as const;

export type DocEntry = CollectionEntry<"docs">;

/** Absolute (base-aware) URL of a documentation page. */
export function docUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const path = id === "index" ? "" : `/${id}`;
  return `${base}/docs${path}`;
}

/**
 * Sorts the documentation into the sidebar order: groups first (in the order
 * declared above), then the `order` of each page inside its group.
 */
export function sortDocs(docs: DocEntry[]): DocEntry[] {
  return [...docs].sort((a, b) => {
    const groupDiff = groupIndex(a.data.group) - groupIndex(b.data.group);

    if (groupDiff !== 0) return groupDiff;
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;

    return a.data.title.localeCompare(b.data.title);
  });
}

function groupIndex(group: string): number {
  const index = (docGroups as readonly string[]).indexOf(group);
  return index === -1 ? docGroups.length : index;
}

/** Groups sorted documents into the sidebar sections. */
export function groupDocs(docs: DocEntry[]): Map<string, DocEntry[]> {
  const groups = new Map<string, DocEntry[]>();

  for (const doc of sortDocs(docs)) {
    const list = groups.get(doc.data.group) ?? [];
    list.push(doc);
    groups.set(doc.data.group, list);
  }

  return groups;
}

/** Removes the Markdown syntax so the raw body can be used as search text. */
export function plainText(body: string | undefined): string {
  if (!body) return "";

  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
