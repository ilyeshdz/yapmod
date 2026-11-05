# Client targets

The client is compiled into a bundle per target. A target is a build target
plus a distribution format; it is not a runtime plugin system.

```text
client/
  platform/host.ts      the ports feature code depends on
  targets/desktop/      Tauri composition roots and host adapter
  targets/web/          page-realm extension entry, isolated bridge and manifest
  core/, features/      shared client code
```

## What a target owns

- A composition root (`preinject` and, for a page target, `postinject`).
- A `YapmodHost` implementation that maps ports to the target's APIs.
- Its output directory in `client/build.mjs`.
- Its distribution and update mechanism.

## Rules

- Feature code reads `getHost()` and never imports a target or a Tauri command.
- Targets may import shared code; they must not import each other.
- Optional ports reflect real capabilities. A target does not fake a port it
  cannot implement.
- A new target needs an adapter and a composition root, not changes to feature
  logic.

## Web target

`pnpm client:build:web` writes an unpacked MV3 extension to `dist/web`. It runs
at `document_start` on the two Yapper origins:

- `preinject.js` runs in `MAIN`, so the client, plugins and network inspectors
  share the page's JavaScript realm.
- `bridge.js` runs in `ISOLATED` and owns extension storage and catalog fetches.
- `background.js` proxies catalog requests with extension host permissions.

| Capability | Desktop | Web |
| --- | --- | --- |
| Settings | Tauri config | extension storage via the bridge |
| Themes | filesystem folders | community catalog and imported folders in extension storage |
| Notifications | system notification center | Web Notifications |
| Window controls | native | none |
| Unread badge | dock/taskbar | none |
| Plugins | page realm, trusted JS | page realm, trusted JS |
| Plugin packages | filesystem folders | community catalog and folder imports in extension storage |
| WebSocket / HTTP inspectors | page realm | page realm |
| Plugin `api.invoke` | native commands | unavailable |
| Updates | app and signed client bundle | browser extension update |

The Web target mirrors the desktop injection model: client and plugin code run
in the page realm, while a narrow isolated bridge supplies the extension-only
capabilities. Plugins still cannot call native host commands or receive signed
remote client updates.
