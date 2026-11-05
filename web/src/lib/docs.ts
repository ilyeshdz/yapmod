import type { CollectionEntry } from "astro:content";

/** The sidebar sections of the ordinary (non-developer) documentation. */
export const docGroups = ["Start", "Contributing"] as const;

/** The two independent developer documentation areas. */
export const docAreas = ["plugins", "themes"] as const;
export type DocArea = (typeof docAreas)[number];

export const areaMeta: Record<
  DocArea,
  { label: string; short: string; description: string; entry: string }
> = {
  plugins: {
    label: "Plugins",
    short: "Plugins",
    description:
      "Build packages that add behavior to the Yapper page, with settings, storage, UI, and network hooks.",
    entry: "Start with the plugin overview",
  },
  themes: {
    label: "Themes",
    short: "Themes",
    description:
      "Create CSS themes with manifests, colour tokens, mode support, and a shareable package.",
    entry: "Start with the theme overview",
  },
};

/** Groups inside each area, in sidebar order. */
const areaGroups: Record<DocArea, readonly string[]> = {
  plugins: ["Overview", "API reference", "Guides", "Publish"],
  themes: ["Overview", "Guides", "Publish"],
};

export type DocEntry = CollectionEntry<"docs">;

/** Absolute (base-aware) URL of a documentation page. */
export function docUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const path = id === "index" ? "" : `/${id}`;
  return `${base}/docs${path}`;
}

/** URL of a developer area's landing page. */
export function areaUrl(area: DocArea): string {
  return docUrl(area);
}

export function areaLabel(area: DocArea): string {
  return areaMeta[area].label;
}

/** Every page that belongs to a developer area, in sidebar order. */
export function docsInArea(docs: DocEntry[], area: DocArea): DocEntry[] {
  return sortDocs(docs.filter((doc) => doc.data.area === area));
}

/**
 * Sorts the documentation into the sidebar order: areas first (ordinary docs,
 * then Plugins, then Themes), then the group order, then `order` inside each
 * group.
 */
export function sortDocs(docs: DocEntry[]): DocEntry[] {
  return [...docs].sort((a, b) => {
    const areaDiff = areaIndex(a.data.area) - areaIndex(b.data.area);

    if (areaDiff !== 0) return areaDiff;

    const groupDiff =
      groupIndex(a.data.group, a.data.area) - groupIndex(b.data.group, b.data.area);

    if (groupDiff !== 0) return groupDiff;
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;

    return a.data.title.localeCompare(b.data.title);
  });
}

function areaIndex(area: DocEntry["data"]["area"]): number {
  if (!area) return 0;
  return docAreas.indexOf(area) + 1;
}

function groupIndex(group: string, area: DocEntry["data"]["area"]): number {
  const groups = area ? areaGroups[area] : docGroups;
  const index = (groups as readonly string[]).indexOf(group);
  return index === -1 ? groups.length : index;
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

/** Removes the Markdown/MDX syntax so the raw body can be used as search text. */
export function plainText(body: string | undefined): string {
  if (!body) return "";

  return body
    .replace(/^import\s.+$/gm, "")
    .replace(/<[^>]+>/g, " ")
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
