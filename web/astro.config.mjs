// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Change these two values if the site is hosted somewhere else.
  // `site` is the origin, `base` is the path prefix the site is served from.
  site: "https://ilyeshdz.github.io",
  base: "/yapmod",
  server: {
    host: "127.0.0.1",
  },
  build: {
    format: "directory",
  },
  devToolbar: {
    enabled: false,
  },
  markdown: {
    shikiConfig: {
      theme: "vitesse-dark",
      wrap: false,
    },
  },
});
