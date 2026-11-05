---
title: Web extension
group: Start
order: 5
eyebrow: Start here
description: What the browser build supports today and how to load it.
---

The web extension is the browser target of the same client that powers the desktop app. It runs inside Yapper in an isolated world, so it can change the page it is attached to but cannot replace page JavaScript.

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
- **Plugins** can be installed from the community catalog or imported from a folder. Packages, plugin settings and consent records live in extension storage, so they survive updates.
- **Notifications** use the browser notification API. The browser asks for permission the first time notifications are enabled.
- **External links** open in a normal browser tab.

## What the browser build does not do

| Feature | Desktop | Web extension |
| --- | --- | --- |
| Window controls | Native window | Browser tab |
| Unread badge | Dock or taskbar | Not available |
| Local theme folders | Yes | Community catalog only |
| Plugin `api.invoke` | Native commands | Unavailable |
| Plugin network inspectors | Page traffic | No page-realm access |
| Client updates | Signed client bundle | Browser extension update |

### How plugins run in the browser

The extension runs in an isolated world. A plugin can change the page DOM and
use the shared plugin API, but it cannot patch the page's JavaScript objects or
observe the page's own HTTP and WebSocket traffic. Plugin scripts run in the
extension world, and `api.invoke` rejects because no host commands are exposed.
Keep plugins self-contained: relative imports and page-realm hooks will not
work.

Settings are shared with the same Yapper account, but the extension keeps its own copy. The desktop app and the extension do not sync settings with each other.
