/**
 * The MV3 manifest of the web target.
 *
 * The version comes from `client/version.json`, so the extension package and
 * the client bundle never disagree.
 */
export function createManifest(version) {
  const matches = ["https://yapin.gg/*", "https://www.yapin.gg/*"];
  const icons = {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  };

  return {
    manifest_version: 3,
    name: "Yapmod Web",
    short_name: "Yapmod",
    version,
    description:
      "Themes, plugins, settings and network inspectors for Yapper, kept in extension storage.",
    homepage_url: "https://github.com/ilyeshdz/yapmod",
    icons,
    // Packages and file-setting data URIs can grow past the default quota.
    permissions: ["storage", "unlimitedStorage"],
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
        js: ["bridge.js"],
        run_at: "document_start",
        world: "ISOLATED",
        all_frames: false,
      },
      {
        matches,
        js: ["preinject.js"],
        run_at: "document_start",
        world: "MAIN",
        all_frames: false,
      },
    ],
  };
}
