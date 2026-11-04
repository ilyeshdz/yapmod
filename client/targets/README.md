# Client targets

The client is compiled into a bundle per target. A target is a build target
plus a distribution format; it is not a runtime plugin system.

```text
client/
  platform/host.ts      the ports feature code depends on
  targets/desktop/      Tauri composition roots and host adapter
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

The Web target is not implemented yet. It will start as an isolated-world
extension with settings, themes and notifications. Plugins, page-realm hooks
and remote client updates stay out of scope until their execution and policy
questions are settled.
