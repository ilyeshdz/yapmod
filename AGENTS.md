# AGENTS.md

<!-- FOR AI AGENTS - human readability is a side effect, not a goal -->
<!-- Last verified: 2026-11-05 -->

**Precedence:** This file contains the project's instructions and conventions. Explicit user instructions override these rules.

## Commands (verified)

Source: `package.json`, `web/package.json`, `.github/workflows/`. Run from the repository root.

| Task | Command | ~Time |
|------|---------|-------|
| Install | `pnpm install` | ~1 min |
| Install website deps | `pnpm --dir web install --frozen-lockfile --ignore-workspace` | ~30 s |
| Dev app | `pnpm tauri dev` | ~1 min first run |
| Rebuild client on change | `pnpm client:dev` | watch |
| Dev website | `pnpm --dir web dev` | ~10 s |
| Typecheck client | `pnpm client:check` | ~5 s |
| Bundle client (desktop) | `pnpm client:build` | ~2 s |
| Bundle web extension | `pnpm client:build:web` | ~2 s |
| Bundle web loader | `pnpm client:build:web:loader` | ~2 s |
| Script tests | `pnpm test:scripts` | ~1 s |
| Rust format | `pnpm check:rust:format` | ~1 s |
| Rust lint | `pnpm check:rust:clippy` | ~1 min |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | ~1 min |
| Regenerate TS types | `pnpm types:generate` | ~1 min |
| Website check + build | `pnpm check:web` | ~30 s |
| Full gate | `pnpm check` | ~3 min |
| Desktop build | `pnpm tauri build` | ~5 min |

> `pnpm check` = script tests + client check/build + Rust format/clippy/generated types + website check/build. CI runs these separately; see `.github/workflows/`.

## File Map

```text
client/              SolidJS/TypeScript injected into the Yapper page
src-tauri/           Rust Tauri 2 desktop shell and native commands
web/                 Astro website and documentation (own package)
scripts/             Node tooling for generated types and client updates
flatpak/             Flatpak manifest and metadata for Flathub distribution
community-plugins/   Source packages published to the plugin catalog
community-themes/    Source packages published to the theme catalog
.github/workflows/   CI, release (stable + nightly), and website deployment
```

## Golden Samples (follow these patterns)

| For | Reference | Key patterns |
|-----|-----------|--------------|
| Tauri command wiring | `src-tauri/src/main.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/default.json` | Handler + remote ACL + capability must agree |
| Shared Rust/TS types | `src-tauri/src/channel.rs` | `#[derive(..., TS)]`, `#[ts(export)]`, boundary tests |
| Injected feature | `client/features/themes/engine.ts` | Scoped install, idempotent DOM writes, cleanup |
| Host port | `client/platform/host.ts` | Feature code asks the port, never the environment |
| Target composition root | `client/targets/desktop/preinject.ts`, `client/targets/web/preinject.ts` | Installs the host, then composes features |
| Web extension shell | `client/targets/web/manifest.mjs` | Store build embeds the client; loader build reads the signed feed |
| Native bridge call | `client/core/tauri.ts` | `invokeCommand`, lazy `__TAURI_INTERNALS__` lookup |
| Plugin/theme validation | `src-tauri/src/plugin.rs`, `src-tauri/src/theme.rs` | Reject traversal, symlinks, oversize input, blocked CSS |
| Website docs page | `web/src/content/docs/` + `web/src/content.config.ts` | Required frontmatter, `group`, `order` |
| Tooling test | `scripts/client-updates.test.mjs` | `node:test`, channel isolation cases |

## Heuristics

| When | Do |
|------|-----|
| Changing a Rust type used by the client | Run `pnpm types:generate`; commit `client/generated/` |
| Adding/removing a Tauri command | Update `main.rs`, `build.rs` app manifest, `capabilities/default.json`, then the client caller |
| Editing anything under `client/` | Run `pnpm client:build` before any Rust/Tauri build |
| Touching a target or platform port | Update both `client/targets/desktop` and `client/targets/web`; `pnpm check:client` verifies parity |
| Touching plugin or theme packages | Validate with the website build and respect the package validation rules |
| Touching release or channel logic | Read `RELEASING.md` first; use workflow `dry_run` inputs |
| Unsure about project conventions | Check this file, `CONTRIBUTING.md`, and `RELEASING.md` when relevant |

## Key Decisions

- The app is a Tauri shell around the live Yapper website. The client is injected at document start and after page load; it is not a bundled SPA.
- Injected code may run only on the exact HTTPS origins `https://yapin.gg` and `https://www.yapin.gg`. Internal navigation also includes subdomains of `yapin.gg`; injection does not.
- The desktop app and the injected client are versioned independently: `src-tauri/Cargo.toml` vs `client/version.json`.
- Stable and nightly are isolated release channels. Each has its own signed client-update feed, cache directory, and release sequence; a build never switches channel through an update.
- Plugins may execute trusted JavaScript in the page realm. Themes are CSS only. Both are treated as user-installed code, not sandboxed content.
- `client/generated/**` is committed and must stay in sync with Rust types. `src-tauri/gen/injection/**` and `src-tauri/gen/schemas/**` are gitignored build output; `src-tauri/permissions/autogenerated/**` is tracked but generated by the Tauri build.

## Codebase State

- Early development; interfaces and bundle formats can still change.
- The website is a separate pnpm project. Root `pnpm install` does not install `web/node_modules`.
- `src-tauri/build.rs` embeds the client bundles and fails the build if they are missing.
- `ci.yml` checks the client, Rust, generated types, and website. `release.yml` builds stable and nightly artifacts and publishes channel-scoped desktop and web client updates; nightly is a scheduled build of `main`.
- The client is multi-target. `client/targets/desktop/` composes the Tauri host, `client/targets/web/` the browser-extension host, and shared features depend only on `client/platform/host.ts` ports.
- Three versions move independently: app (`src-tauri/Cargo.toml`), client (`client/version.json`), and web shell (`client/targets/web/version.json`).

## Boundaries

### Always Do

- Read this `AGENTS.md` before editing.
- Run the smallest relevant check after each change; run `pnpm check` before claiming completion.
- Regenerate committed types after changing their Rust sources; rebuild client bundles locally before Rust/Tauri builds.
- Add or update tests when changing validation, channels, config, plugins, or themes.
- Use conventional commit prefixes such as `feat(scope):`, `fix(scope):`, `refactor(scope):`.
- Keep pull requests focused; all development targets `main`.

### Ask First

- Adding dependencies or changing build tooling.
- Changing `src-tauri/capabilities/default.json`, `build.rs` command ACLs, or injection origins.
- Changing CI/CD, release workflows, signing, or update-feed formats.
- Changing the plugin/theme manifest or catalog format.
- Repo-wide refactors or version bumps.

### Never Do

- Edit `client/generated/**` or `src-tauri/gen/injection/**` by hand.
- Broaden injection to wildcard/subdomains or non-HTTPS origins.
- Bypass plugin/theme validation, size limits, or path/symlink checks.
- Run a non-dry-run release or client-update publication from the wrong branch.
- Commit signing keys, tokens, or downloaded private assets.
- Push directly to `main`.

## Terminology

| Term | Means |
|------|-------|
| Injected client | The `client/` code embedded into the remote Yapper page |
| Preinject | Script injected at document start; owns settings, theme engine, plugin API |
| Postinject | Script injected after page load; owns window controls and update UI |
| Client bundle | Independently updated signed artifact containing preinject/postinject + minimum CSS |
| App version | Desktop package version from `src-tauri/Cargo.toml` |
| Client version | Injected bundle version from `client/version.json` |
| Web shell version | Browser-extension package version from `client/targets/web/version.json` |
| Target | A composition root that installs a host: `desktop`, `web` (store), or `web-loader` (self-hosted) |
| Channel | `stable` or `nightly`; baked into the build, never a user setting |
| Community catalog | Static website output listing installable plugins/themes |