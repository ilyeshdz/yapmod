// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
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
  integrations: [
    starlight({
      title: "yapmod",
      logo: {
        alt: "yapmod logo",
        src: "./src/assets/yapmod-logo.png",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/ilyeshdz/yapmod",
        },
      ],
      customCss: ["./src/styles/starlight.css"],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Introduction", slug: "introduction" },
            { label: "Install", slug: "install" },
            { label: "Desktop Features", slug: "desktop-features" },
            { label: "Web Extension", slug: "web-extension" },
            { label: "Release Channels", slug: "release-channels" },
            { label: "Run from Source", slug: "run-from-source" },
            { label: "Troubleshooting", slug: "troubleshooting" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { label: "Getting Started", slug: "plugins/getting-started" },
            { label: "Architecture", slug: "plugins/architecture" },
            { label: "Manifest", slug: "plugins/manifest" },
            { label: "Development", slug: "plugins/development" },
            { label: "Debugging", slug: "plugins/debugging" },
            { label: "Security", slug: "plugins/security" },
            { label: "Best Practices", slug: "plugins/best-practices" },
            { label: "Examples", slug: "plugins/examples" },
            {
              label: "API Reference",
              items: [
                { label: "Overview", slug: "plugins/api" },
                { label: "Core", slug: "plugins/api/core" },
                { label: "Types", slug: "plugins/api/types" },
                { label: "Interface", slug: "plugins/api/interface" },
                { label: "Components", slug: "plugins/api/components" },
                { label: "Network", slug: "plugins/api/network" },
                { label: "Files", slug: "plugins/api/files" },
                { label: "Storage & Settings", slug: "plugins/api/storage-settings" },
              ],
            },
            {
              label: "Guides",
              items: [
                { label: "UI", slug: "plugins/guides/ui" },
                { label: "Settings", slug: "plugins/guides/settings" },
                { label: "Network", slug: "plugins/guides/network" },
              ],
            },
            { label: "Submit a Plugin", slug: "submit-a-plugin" },
          ],
        },
        {
          label: "Themes",
          items: [
            { label: "Getting Started", slug: "themes/getting-started" },
            { label: "Manifest", slug: "themes/manifest" },
            { label: "Styling", slug: "themes/styling" },
            { label: "Loading", slug: "themes/loading" },
            { label: "Recipes", slug: "themes/recipes" },
            { label: "Debugging", slug: "themes/debugging" },
            { label: "Best Practices", slug: "themes/best-practices" },
            { label: "Using Themes", slug: "using-themes" },
            { label: "Installing Plugins", slug: "installing-plugins" },
            { label: "Community Themes", slug: "community-themes" },
            { label: "Submit a Theme", slug: "submit-a-theme" },
          ],
        },
        {
          label: "Contributing",
          items: [
            { label: "Contributing Guide", slug: "contributing" },
          ],
        },
      ],
      pagefind: true,
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: "",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Geist+Pixel&family=Geist:wght@400;500;600;700;800&display=swap",
          },
        },
      ],
    }),
    mdx(),
    preact(),
  ],
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
