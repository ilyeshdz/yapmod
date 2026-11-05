import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

/**
 * The documentation lives in `src/content/docs` as plain Markdown.
 *
 * - `group`  the sidebar section the page belongs to
 * - `order`  the position inside that group
 * - `title`  the page title, also used for the document title and the nav
 * - `area`   keeps the developer Plugins and Themes docs in separate sidebars
 */
const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    group: z.string().default("Guide"),
    order: z.number().default(0),
    eyebrow: z.string().optional(),
    area: z.enum(["plugins", "themes"]).optional(),
  }),
});

/**
 * Blog posts live in `src/content/blog` as plain Markdown.
 *
 * - `title`       the post title
 * - `description` a short summary shown on the index page
 * - `date`        the publication date (YYYY-MM-DD)
 * - `author`      the author name
 */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.string(),
    author: z.string().optional(),
  }),
});

export const collections = { docs, blog };
