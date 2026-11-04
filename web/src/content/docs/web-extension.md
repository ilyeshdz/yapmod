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
- **Notifications** use the browser notification API. The browser asks for permission the first time notifications are enabled.
- **External links** open in a normal browser tab.

## What the browser build does not do

| Feature | Desktop | Web extension |
| --- | --- | --- |
| Window controls | Native window | Browser tab |
| Unread badge | Dock or taskbar | Not available |
| Plugins | Trusted page JavaScript | Not installed |
| Local theme folders | Yes | Community catalog only |
| Client updates | Signed client bundle | Browser extension update |

Plugins are deliberately absent. The extension runs in an isolated world, where a plugin could not use the same page-realm APIs as the desktop client. Theme packages are CSS only, so installing them does not execute code.

Settings are shared with the same Yapper account, but the extension keeps its own copy. The desktop app and the extension do not sync settings with each other.
