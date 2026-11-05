/**
 * The MV3 manifest of the web target.
 *
 * The version comes from `client/version.json`, so the extension package and
 * the client bundle never disagree.
 */
export function createManifest(version) {
  const matches = ["https://yapin.gg/*", "https://www.yapin.gg/*"];

  return {
    manifest_version: 3,
    name: "yapmod",
    version,
    description:
      "Themes, plugins, settings and notifications for Yapper in the browser.",
    homepage_url: "https://github.com/ilyeshdz/yapmod",
    permissions: ["storage"],
    host_permissions: [
      ...matches,
      "https://ilyeshdz.github.io/yapmod/community-themes/*",
      "https://ilyeshdz.github.io/yapmod/community-plugins/*",
    ],
    background: {
      service_worker: "background.js",
    },
    content_scripts: [
      {
        matches,
        js: ["preinject.js"],
        run_at: "document_start",
        world: "ISOLATED",
        all_frames: false,
      },
    ],
  };
}
