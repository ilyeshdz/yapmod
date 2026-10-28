// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://ilyeshdz.github.io",
  base: "/yapmod",
  redirects: {
    "/docs/creating-plugins": "/yapmod/docs/plugins/getting-started",
    "/docs/creating-themes": "/yapmod/docs/themes/getting-started",
  },
  integrations: [mdx()],
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
