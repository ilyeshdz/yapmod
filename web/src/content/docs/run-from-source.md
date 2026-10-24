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
pnpm --dir web install --frozen-lockfile --ignore-workspace
```

## Develop

Start the desktop app in development mode from the repository root:

```bash
pnpm tauri dev
```

This makes a one-time client build, then opens the Yapmod window. The window loads the live Yapper site.

To develop the website-backed community theme catalog locally, start the website in a second terminal before opening **Settings → Themes → Community**:

```bash
pnpm --dir web dev
```

The app's debug build reads the catalog from the local Astro server at `127.0.0.1:4321`. The dev command prepares the catalog and theme files from `community-themes/` before starting Astro. Release builds use the published Yapmod website.

When working on files in `client/`, optionally run this in a second terminal to rebuild the bundle after each edit:

```bash
pnpm client:dev
```

Restart the app after an edit to load the rebuilt bundle. The watcher rebuilds files only; it does not hot-swap code into a running app.

To preview the client-update prompt without a signed update feed, start a debug build with the local test switch:

```bash
YAPMOD_TEST_CLIENT_UPDATE=1 pnpm tauri dev
```

This shows a simulated `local-test` update so you can try **Later**, the reminder, and **Restart now**. It does not install a client bundle. The switch is ignored by release builds; quit the app and start it again without the variable to return to normal update checks.

## Build

Run the project checks before opening a pull request:

```bash
pnpm check
```

This type-checks and bundles the client, checks Rust formatting and lints,
verifies generated types, and checks and builds the website. Install the
website dependencies once with the setup command above. You can run the
checks for one part of the project with `pnpm check:client`, `pnpm check:rust`,
or `pnpm check:web`.

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
| `pnpm check` | Runs the full client, Rust, generated-type, and website checks. |
| `pnpm check:client` | Type-checks and bundles the injected client. |
| `pnpm check:rust` | Checks Rust formatting, lints, and generated types. |
| `pnpm check:web` | Type-checks and builds the website. |

The website in `web/` is a separate Astro project. Run these commands from that directory:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the site on `localhost:4321`. |
| `pnpm build` | Builds the site into `dist/`. |
| `pnpm check` | Type-checks the Astro components. |

## Where to look next

- [Contributing](contributing) for how to get a change in.
