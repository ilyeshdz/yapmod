---
title: Web extension
description: What the browser build supports today and how to load it.
---

The web extension is the browser target of the same client that powers the desktop app. Like the desktop client, it runs inside the Yapin page realm, so plugins and network inspectors see the same JavaScript objects as the page. A small isolated bridge supplies extension storage and catalog access.

> **In development**
> The extension is not published yet. Build it from source to try it.

## Build and load it

```bash
pnpm install
pnpm client:build:web
```

To also produce an installable zip:

```bash
pnpm client:package:web
```

This writes `dist/yapmod-web-<version>.zip` with the manifest at the archive root.

For runtime client updates, build the self-hosted loader instead:

```bash
YAPMOD_CLIENT_UPDATE_PUBLIC_KEY=<base64 key> pnpm client:package:web:loader
```

This writes `dist/yapmod-web-loader-<version>.zip` and `dist/web-loader`. Use the loader for unpacked or self-hosted installs only; browser stores do not allow downloading and running client code. Both builds share the same settings, themes, plugins and page-realm client.

Load `dist/web` as an unpacked extension:

1. Open `chrome://extensions` in Chrome, Edge or another Chromium browser.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `dist/web`.
4. The extension appears as **Yapmod Web**.
5. Open [Yapin](https://www.yapin.gg) and use **Settings → Yapmod**.

The extension matches only `https://yapin.gg/*` and `https://www.yapin.gg/*`.

## Versions

The extension has its own shell version and embeds the shared client version:

| Version | Source | Meaning |
| --- | --- | --- |
| Extension version | `client/targets/web/version.json` | The installed package; shown in the browser's extension page |
| Client version | `client/version.json` | The injected Yapmod client inside the package |

**Settings → Yapmod** shows both, for example `Extension v1.0.0 · Client v1.0.3`. A client-only change still ships as a new extension package, because a store build has to contain the client code. Desktop receives the same client version through the signed client feed; the browser receives it through the extension update.

### Store build and loader build

| Build | Intended for | How the client updates |
| --- | --- | --- |
| `dist/web` | Browser stores | The browser updates the whole extension |
| `dist/web-loader` | Unpacked and self-hosted installs | The signed web feed updates the client at runtime |

The loader verifies the Ed25519 manifest signature, the channel, the expiry, the release sequence and the bundle hash before it stages a client. The new client runs on the next page load; a successful start confirms it, and a bundle that never starts is discarded. The extension shell itself still updates like any extension, and a client that needs a new shell capability waits for a new shell.

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
