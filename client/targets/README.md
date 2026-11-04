# Client targets

The client is compiled into a bundle per target. A target is a build target
plus a distribution format; it is not a runtime plugin system.

```text
client/
  platform/host.ts      the ports feature code depends on
  targets/desktop/      Tauri composition roots and host adapter
  targets/web/          isolated-world extension entry, adapter and manifest
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
at `document_start` in an isolated world on the two Yapper origins.

| Capability | Desktop | Web |
| --- | --- | --- |
| Settings | Tauri config | extension storage |
| Themes | filesystem folders | community catalog in extension storage |
| Notifications | system notification center | Web Notifications |
| Window controls | native | none |
| Unread badge | dock/taskbar | none |
| Plugins | page realm, trusted JS | not installed |
| Updates | app and signed client bundle | browser extension update |

Plugins, page-realm hooks and remote client updates stay out of scope for the
Web target until their execution and policy questions are settled.
