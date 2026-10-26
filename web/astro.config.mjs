// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
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
