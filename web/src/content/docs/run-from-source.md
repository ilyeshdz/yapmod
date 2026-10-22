---
title: Run from source
group: Contributing
order: 1
eyebrow: Contributing
description: Set up a local development environment and build yapmod yourself.
---

To work on yapmod you need a normal desktop development setup: Node.js for the injected scripts and the Rust toolchain for the desktop shell.

> **Before you start**
> yapmod is early and moves quickly. If you are planning anything larger than a small fix, [open an issue](https://github.com/ilyeshdz/yapmod/issues) first so the direction is agreed on.

## Requirements

- Node.js and [pnpm](https://pnpm.io)
- The Rust toolchain
- Tauri 2's system dependencies for your operating system (see Tauri's [prerequisites guide](https://tauri.app/start/prerequisites/))

## Set up

```bash
git clone https://github.com/ilyeshdz/yapmod
cd yapmod
pnpm install
```

## Develop

Start the desktop app in development mode from the repository root:

```bash
pnpm tauri dev
```

This makes a one-time client build, then opens the Yapmod window. The window loads the live Yapper site.

When working on files in `client/`, optionally run this in a second terminal to rebuild the bundle after each edit:

```bash
pnpm client:dev
```

Restart the app after an edit to load the rebuilt bundle. The watcher rebuilds files only; it does not hot-swap code into a running app.

## Build

```bash
# type-check the injected client
pnpm client:check

# bundle the client (also runs automatically for Tauri builds)
pnpm client:build

# build the installers for your platform
pnpm tauri build
```

## Command reference

| Command | What it does |
| --- | --- |
| `pnpm tauri` | Runs the Tauri CLI. |
| `pnpm client:build` | Bundles `client/` into the app's embedded fallback scripts. |
| `pnpm client:dev` | Watches and rebuilds the client bundle for local development. |
| `pnpm client:check` | Type-checks the injected client. |
| `pnpm types:generate` | Regenerates the TypeScript types from the Rust types. |

The website in `web/` is a separate Astro project. Run these commands from that directory:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the site on `localhost:4321`. |
| `pnpm build` | Builds the site into `dist/`. |
| `pnpm check` | Type-checks the Astro components. |

## Where to look next

- [Contributing](contributing) for how to get a change in.
