---
title: Web extension
group: Start
order: 5
eyebrow: Start here
description: What the browser build supports today and how to load it.
---

The web extension is the browser target of the same client that powers the desktop app. Like the desktop client, it runs inside the Yapper page realm, so plugins and network inspectors see the same JavaScript objects as the page. A small isolated bridge supplies extension storage and catalog access.

> **In development**
> The extension is not published yet. Build it from source to try it.

## Build and load it

```bash
pnpm install
pnpm client:build:web
```

Load `dist/web` as an unpacked extension:

1. Open `chrome://extensions` in Chrome, Edge or another Chromium browser.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `dist/web`.
4. Open [Yapper](https://www.yapin.gg) and use **Settings → Yapmod**.

The extension matches only `https://yapin.gg/*` and `https://www.yapin.gg/*`.

## What works

- **Settings** are stored in extension storage and survive updates.
- **Themes** can be browsed and installed from the community catalog. Installed themes are kept in extension storage and applied to the page.
- **Plugins** can be installed from the community catalog or imported from a folder. Packages, plugin settings and consent records live in extension storage, so they survive updates. Plugin scripts run in the page realm.
- **Plugin inspectors** can observe and modify Yapper's WebSocket and HTTP traffic, just like on desktop.
- **Notifications** use the browser notification API. The browser asks for permission the first time notifications are enabled.
- **External links** open in a normal browser tab.

## What the browser build does not do

| Feature | Desktop | Web extension |
| --- | --- | --- |
| Window controls | Native window | Browser tab |
| Unread badge | Dock or taskbar | Not available |
| Local theme folders | Yes | Community catalog only |
| Plugin `api.invoke` | Native commands | Unavailable |
| Client updates | Signed client bundle | Browser extension update |

### How the client runs in the browser

`preinject.js` runs in the page's `MAIN` world, alongside Yapper and its
plugins. `bridge.js` runs in the extension's `ISOLATED` world and is the only
code that can use extension storage or the background catalog worker. The two
communicate over a private `MessageChannel` created at `document_start`, before
page scripts run.

Plugins therefore keep desktop-like page access: they can patch page objects,
use `api.webSocket` and `api.http`, and inspect real Yapper traffic. The only
missing host capability is `api.invoke`, which rejects because the browser has
no equivalent native command bridge. Keep plugins self-contained: relative
imports still cannot be resolved.

Settings are shared with the same Yapper account, but the extension keeps its own copy. The desktop app and the extension do not sync settings with each other.
