/**
 * The MV3 manifest of the web target.
 *
 * The version comes from `client/targets/web/version.json`; the injected client
 * version is compiled into the bundles and reported at runtime.
 */

const YAPPER_MATCHES = ["https://yapin.gg/*", "https://www.yapin.gg/*"];

/** The signed feed the self-hosted loader build reads. */
export const WEB_UPDATE_FEED =
  "https://ilyeshdz.github.io/yapmod/client-updates-web";

const ICONS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
};

/**
 * @param {string} version
 * @param {{ loader?: boolean }} [options]
 */
export function createManifest(version, options = {}) {
  const loader = options.loader === true;

  return {
    manifest_version: 3,
    name: "Yapmod Web",
    short_name: "Yapmod",
    version,
    description:
      "A free, open-source, lightweight version of yapmod built for web support.",
    homepage_url: "https://github.com/ilyeshdz/yapmod",
    icons: ICONS,
    // Packages and file-setting data URIs can grow past the default quota.
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: [
      ...YAPPER_MATCHES,
      "https://ilyeshdz.github.io/yapmod/community-themes/*",
      "https://ilyeshdz.github.io/yapmod/community-plugins/*",
      // A store build lets the browser deliver the client. The loader build
      // also fetches the signed web feed.
      ...(loader ? [`${WEB_UPDATE_FEED}/*`] : []),
    ],
    background: {
      service_worker: "background.js",
    },
    content_scripts: [
      {
        matches: YAPPER_MATCHES,
        js: ["bridge.js"],
        run_at: "document_start",
        world: "ISOLATED",
        all_frames: false,
      },
      {
        matches: YAPPER_MATCHES,
        js: [loader ? "loader.js" : "preinject.js"],
        run_at: "document_start",
        world: "MAIN",
        all_frames: false,
      },
    ],
  };
}
