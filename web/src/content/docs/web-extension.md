---
title: Web extension
description: What the browser build supports today, how to install it, and how updates work.
---

The web extension is the browser target of the same client that powers the desktop app. Like the desktop client, it runs inside the Yapin page realm, so plugins and network inspectors see the same JavaScript objects as the page. A small isolated bridge supplies extension storage and catalog access.

> **In development**
> The extension is not published to browser stores yet. Build it from source to try it.

## Build the extension

From the repository root:

```bash
pnpm install
pnpm client:build:web
```

This produces the unpacked extension in `dist/web/`.

To also produce an installable zip archive:

```bash
pnpm client:package:web
```

This writes `dist/yapmod-web-<version>.zip` with the manifest at the archive root, ready for store submission or distribution.

### Loader build (self-hosted runtime updates)

For runtime client updates without republishing the extension, build the self-hosted loader instead:

```bash
YAPMOD_CLIENT_UPDATE_PUBLIC_KEY=<base64 key> pnpm client:package:web:loader
```

This writes `dist/yapmod-web-loader-<version>.zip` and `dist/web-loader/`. Use the loader for unpacked or self-hosted installs only; browser stores do not allow extensions to download and execute client code at runtime. Both the store and loader builds share the same settings, themes, plugins, and page-realm client.

## Install the extension

### Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `dist/web` folder.
4. The extension appears as **Yapmod Web**.
5. Open [Yapin](https://www.yapin.gg) and navigate to **Settings → Yapmod** to configure the extension.

### Microsoft Edge

1. Open `edge://extensions` in Edge.
2. Turn on **Developer mode** (toggle on the left sidebar).
3. Click **Load unpacked** and select the `dist/web` folder.
4. The extension appears as **Yapmod Web**.
5. Open [Yapin](https://www.yapin.gg) and navigate to **Settings → Yapmod**.

### Firefox

Firefox uses the `browser.*` API namespace instead of `chrome.*`. The extension detects both automatically and works without code changes.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Navigate into `dist/web` and select `manifest.json`.
4. The extension appears as **Yapmod Web**.
5. Open [Yapin](https://www.yapin.gg) and navigate to **Settings → Yapmod**.

> **Note:** Firefox's "Load Temporary Add-on" reloads the extension on every browser restart. For persistent installation, package the extension as an XPI or use WebExt Runner for development.

### Origin restrictions

The extension matches only `https://yapin.gg/*` and `https://www.yapin.gg/*`. It will not inject on other domains, subdomains, or HTTP origins. This restriction is enforced by the manifest `content_scripts` matches and cannot be bypassed.

## Versions

The extension has three independent versions:

| Version | Source | Meaning |
| --- | --- | --- |
| Extension (shell) version | `client/targets/web/version.json` | The installed package; shown in the browser's extension page |
| Client version | `client/version.json` | The injected Yapmod client inside the package |
| Web loader version | `client/targets/web/version.json` | Same as shell version; the loader build shares the shell |

**Settings → Yapmod** shows both the extension and client versions, for example `Extension v1.0.0 · Client v1.0.3`.

### Store build vs loader build

| Build | Intended for | How the client updates |
| --- | --- | --- |
| `dist/web` (store) | Browser stores (Chrome Web Store, etc.) | The browser updates the whole extension package |
| `dist/web-loader` (loader) | Unpacked and self-hosted installs | The signed web feed updates the client at runtime |

A client-only change still ships as a new extension package for the store build, because the store requires all code to be bundled. The loader build can update the client independently via the signed web feed without republishing the extension shell.

## How updates work

### Store build

The store build receives updates through the browser's extension update mechanism. When a new extension version is published to the store, the browser downloads and installs it automatically (or prompts the user, depending on browser settings). The embedded client version updates along with the shell.

### Loader build (runtime client updates)

The loader build can update the injected client at runtime without republishing the extension. The update process works as follows:

1. **Check:** On each page load, the client checks the signed web feed at `https://ilyeshdz.github.io/yapmod/client-updates-web/stable/` for a newer version.
2. **Verify:** The loader downloads three files — `manifest.json`, `manifest.sig`, and `bundle.json` — and validates them before using any of them:
   - The Ed25519 signature on the manifest is verified against the embedded public key.
   - The manifest expiry time must not have passed.
   - The release sequence must be greater than the cached bundle's sequence.
   - The SHA-256 hash of `bundle.json` must match the manifest's `bundleSha256`.
   - The bundle fields (version and sequence) must match the manifest.
3. **Stage:** If all checks pass, the new client code is written to `localStorage` (shared between the isolated bridge and page worlds) and will run on the next page load.
4. **Confirm:** When the new client successfully boots, the bridge confirms the cached bundle. If the client fails to start, the loader removes the cached bundle and falls back to the embedded client on the next load.
5. **Auto-update:** By default, the client checks for updates on each page load. You can disable this in **Settings → Yapmod** by turning off auto-update.

### Checking for updates manually

To check for client updates manually, open **Settings → Yapmod** and look for the update banner. If a newer client is available, a banner will appear offering to apply the update on the next page load.

### Updates

The extension is compiled to read the signed stable feed. A build never switches feeds at runtime; a new build embeds the client it ships with and the loader picks up later signed updates from the same feed.

## Security model

The web extension uses several layers of security to protect against tampering and unauthorized access:

### Origin restrictions

The extension injects content scripts only on `https://yapin.gg/*` and `https://www.yapin.gg/*`. This is enforced by the manifest `content_scripts` `matches` field and cannot be bypassed. The extension does not run on HTTP origins, subdomains, or any other domain.

### Signed client updates

The loader build verifies every client update before executing it:

- **Ed25519 signatures:** Each manifest is signed with an Ed25519 private key. The loader embeds the corresponding public key and verifies the signature before trusting any manifest data.
- **Bundle hash:** The SHA-256 hash of the downloaded bundle is compared against the manifest's declared hash. A mismatch rejects the update.
- **Expiry:** Each manifest includes an expiry timestamp. Expired manifests are rejected.
- **Release sequence:** The loader tracks the release sequence number and will not downgrade to an older sequence.
- **Size limits:** Downloads are capped at 16 KB for the manifest, 1 KB for the signature, and 8 MB for the bundle.

### Isolated bridge architecture

The extension uses a two-world architecture:

- **Page realm (MAIN world):** The client and plugin scripts run here, alongside Yapin's own scripts. They have full access to page objects, WebSocket, and HTTP inspectors.
- **Isolated world (ISOLATED world):** The bridge script runs here and is the only code that can access extension storage or communicate with the background worker. The two worlds communicate over a private `MessageChannel` created at `document_start`.

This separation means plugins cannot directly access extension storage or the background worker — they must go through the bridge API, which validates all requests.

### Background worker restrictions

The background service worker only fetches from allowed URLs:
- The community theme catalog (`https://ilyeshdz.github.io/yapmod/community-themes/*`)
- The community plugin catalog (`https://ilyeshdz.github.io/yapmod/community-plugins/*`)
- The signed client update feed (loader build only)

All other network requests from the background worker are rejected.

## What works

- **Settings** are stored in extension storage and survive updates.
- **Themes** can be browsed and installed from the community catalog, or imported from a local folder. Installed themes are kept in extension storage and applied to the page.
- **Plugins** can be installed from the community catalog or imported from a folder. Packages, plugin settings and consent records live in extension storage, so they survive updates. Plugin scripts run in the page realm.
- **Plugin inspectors** can observe and modify Yapin's WebSocket and HTTP traffic, just like on desktop.
- **Notifications** use the browser notification API. The browser asks for permission the first time notifications are enabled.
- **Bug reports** include the extension and client versions, your platform and other technical details. Choose **Report a bug** in **Settings → Yapmod** to copy the report or open a prefilled GitHub issue.
- **External links** open in a normal browser tab.

## What the browser build does not do

| Feature | Desktop | Web extension |
| --- | --- | --- |
| Window controls | Native window | Browser tab |
| Unread badge | Dock or taskbar | Not available |
| Local theme folders | Yes | Imported into extension storage |
| Plugin `api.invoke` | Native commands | Unavailable |
| Client updates | Signed client bundle | Store: browser extension update; loader: signed web bundle |

### How the client runs in the browser

`preinject.js` runs in the page's `MAIN` world, alongside Yapin and its
plugins. `bridge.js` runs in the extension's `ISOLATED` world and is the only
code that can use extension storage or the background catalog worker. The two
communicate over a private `MessageChannel` created at `document_start`, before
page scripts run.

Plugins therefore keep desktop-like page access: they can patch page objects,
use `api.webSocket` and `api.http`, and inspect real Yapin traffic. The only
missing host capability is `api.invoke`, which rejects because the browser has
no equivalent native command bridge. Keep plugins self-contained: relative
imports still cannot be resolved.

Settings are shared with the same Yapin account, but the extension keeps its own copy. The desktop app and the extension do not sync settings with each other.

## Troubleshooting

### Extension does not appear on Yapin

- Verify you're on `https://yapin.gg` or `https://www.yapin.gg`. The extension only matches these exact HTTPS origins.
- Check that the extension is enabled in your browser's extension management page.
- Reload the Yapin page after loading the extension.

### Settings or plugins disappear after update

- The store build stores data in extension storage, which persists across updates. If data is missing, check that you're using the same browser profile.
- The loader build uses `localStorage` for the update cache. Clearing browser site data will remove the cached client bundle, but settings and plugins in extension storage are unaffected.

### Client update fails or rolls back

The loader automatically rolls back a client update if the new client fails to start. To diagnose:

- Open the browser DevTools console and look for `[yapmod]` error messages.
- Verify the public key used to build the loader matches the signing key for the feed.
- Check that the feed paths and release sequence match the published stable feed.
- If auto-update is causing issues, disable it in **Settings → Yapmod**.

### Firefox temporary add-on disappears after restart

Firefox's "Load Temporary Add-on" is designed for development and does not persist across browser restarts. For persistent installation:

- Use the packaged zip (`dist/yapmod-web-<version>.zip`) converted to XPI format.
- Use WebExt Runner for development: `npx web-ext run --source-dir dist/web`.

### Plugin `api.invoke` is unavailable

The browser extension has no native backend, so `api.invoke` (which calls Tauri commands on desktop) is not available. Plugins that rely on native commands will not work in the browser extension. Check the plugin's documentation for browser compatibility.

### Notifications not showing

- Ensure your browser has granted notification permission to the extension.
- Check that browser-level notification settings are not blocking the site.
- Some browsers require the tab to be visible for notifications to appear in developer mode.

### Report a bug

To generate a bug report with extension and client versions, platform details, and technical information:

1. Open [Yapin](https://www.yapin.gg).
2. Navigate to **Settings → Yapmod**.
3. Click **Report a bug** to copy the report or open a prefilled GitHub issue.
