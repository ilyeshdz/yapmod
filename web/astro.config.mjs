// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  site: "https://ilyeshdz.github.io",
  base: "/yapmod",
  redirects: {
    "/docs/creating-plugins": "/yapmod/docs/plugins/getting-started",
    "/docs/creating-themes": "/yapmod/docs/themes/getting-started",
  },
  integrations: [mdx(), preact()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    format: "directory",
    // Inline the CSS so userland navigation never depends on a separate hashed
    // stylesheet request. Keeps every docs page styled on first paint and on
    // client-side route changes.
    inlineStylesheets: "always",
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
