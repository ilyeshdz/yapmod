---
sessionId: session-261105-212914-1kca
---

# Changes Since v0.6.0

## What Changed Since v0.6.0

**71 commits** across **217 files**: **+17,606 / -4,331 lines** (net +13,275)

### Current Version State

| Version | File | Current | For v0.7.0 |
|---------|------|---------|------------|
| App (desktop) | `src-tauri/Cargo.toml` | `0.6.0` | **`0.7.0`** |
| Client (injected) | `client/version.json` | `1.1.1` | **`1.2.0`** (major client changes) |
| Web shell (extension) | `client/targets/web/version.json` | `1.0.0` | **`1.1.0`** (new bridge, storage, plugins) |

### Feature Categories

**1. Web Extension Target** (new product — 15 commits, 20+ files, ~2,500 lines)
- Browser extension running the Yapmod client in Chrome/Firefox
- Page-realm execution behind an isolated bridge (`client/targets/web/bridge.ts`)
- Extension storage backend for plugins and themes (`chrome.storage.local`)
- Plugin import, runtime, and theme import from local files
- Self-hosted loader build with signed client update feed verification
- Separate extension shell versioning, RPC layer, manifest, background service worker

**2. Multi-Target Client Architecture** (5 commits, ~800 lines)
- Unified host contract (`client/platform/host.ts`) — desktop and web both implement it
- Desktop target migrated to `client/targets/desktop/` with `host.ts`, `preinject.ts`, `postinject.ts`
- Feature code communicates via message ports, never direct Tauri calls
- Target-aware shared UI for settings and themes
- Engine/repository split for themes and plugins
- Architecture tests enforcing target and host boundaries

**3. CI/CD & Release Pipeline Overhaul** (5+ commits)
- Consolidated 7 workflow files into 2 (`release.yml` at 710 lines, `ci.yml`)
- Unified `scripts/build.mjs` (415 lines) replacing separate type/version scripts
- Web extension packaging (`scripts/package-web-extension.mjs`)
- Web bundle validation (`scripts/check-web-bundle.mjs`)
- Signed web client update feed publication in the release train
- Web loader package attached to GitHub releases

**4. Plugin System Enhancements** (9 commits)
- Plugin UI component system (`client/features/plugins/ui.ts`, 320 lines) with CSS
- Settings panel registration API for custom plugin settings
- Monaco-based Quick CSS editor (built-in)
- Icon button system with 12 icons
- Plugin reload functionality with auto re-enable
- Plugin package utilities and repository layer
- Popup Remover community plugin (PR #19)

**5. Theme System Enhancements** (9 commits)
- Mono Dark community theme with font import and beige accent
- Portal theme (renamed from GLaDOS) with external CSS resource support
- Theme token mapping — accent colors map to Yapper's primary host CSS variables
- Theme engine improvements, repository layer, package utilities
- Plugin-style theme cards, preview support removed
- Community theme catalog auto-generation

**6. Documentation Website Overhaul** (6+ commits, ~5,500 lines)
- Client-side routing with Preact, search palette
- 22 new documentation pages (plugins API, architecture, guides, themes, web extension)
- API reference data generation (`plugin-api.json`, `plugin-reference.json`, `theme-reference.json`)
- Docs sidebar, layout, and styles overhaul
- Community catalog build scripts

**7. Core Fixes**
- localStorage backup for settings persistence on app close
- Plugin restore fix after document body exists
- Custom settings positioning in settings sidebar
- Client release deadlock fix and missing `OUTPUT_DIR`
- Custom background opacity control
- Notification and link handling improvements

**8. Rust/Tauri Backend**
- Plugin and theme validation simplified (Rust boundary trusted, net -196 lines)
- External resources allowed in plugin/theme CSS
- HTTP and notification module improvements
- Yaplay integration removed (reverted before release)

**9. Project Documentation**
- AGENTS.md — comprehensive AI agent guidelines
- RELEASING.md — extensively updated with version model, web packaging, store/loader builds
- CONTRIBUTING.md simplified
- README.md updated (early dev warning removed)

**10. Community Content**
- New plugins: popup-remover
- New themes: Mono Dark, Portal
- Updated: custom-background (opacity control)
- Removed: quick-css community plugin (replaced by built-in)
- Catalog infrastructure with validation rules


# Step-by-Step Release Guide

## Step-by-Step Guide: Publishing v0.7.0

### Prerequisites
- You have `CLIENT_UPDATE_SIGNING_KEY` (Ed25519) as a repository **Secret**
- You have `CLIENT_UPDATE_PUBLIC_KEY` as a repository **Variable**
- `main` is the default branch and all changes are pushed

---

### Step 1: Verify the Repository is Clean

```bash
git checkout main
git pull origin main
git status  # should be clean
```

Make sure the Yaplay removal commit (`e7cfc4b`) is on `main` — it is already pushed.

---

### Step 2: Run Full Pre-Release Checks

```bash
pnpm install
pnpm check
```

This runs (~3 min total):
- `test:scripts` — script tests (channel manifests, web packaging)
- `client:check` — client typecheck
- `client:build` — desktop client bundle
- `client:build:web` — web extension bundle
- `client:build:web:loader` — web loader bundle
- `check:rust:format` — Rust format
- `check:rust:clippy` — Rust lint
- `types:generate --check` — generated types in sync
- `check-web` — website check + build

**All must pass before proceeding.**

---

### Step 3: Bump the App Version

Edit `src-tauri/Cargo.toml`:

```toml
[package]
name = "yapmod"
version = "0.7.0"  # was "0.6.0"
```

---

### Step 4: Bump the Client Version

The injected client has changed significantly (multi-target refactor, web extension, plugin/theme enhancements). Bump `client/version.json`:

```json
{
  "version": "1.2.0"
}
```

---

### Step 5: Bump the Web Shell Version

The extension shell has changed (new bridge, storage, plugins, update feed, loader). Bump `client/targets/web/version.json`:

```json
{
  "version": "1.1.0"
}
```

---

### Step 6: Rebuild Client Bundles and Regenerate Types

```bash
pnpm client:build
pnpm client:build:web
pnpm client:build:web:loader
pnpm types:generate
```

---

### Step 7: Write the Release Notes

Create `.github/release-notes/v0.7.0.md` (see the draft below).

---

### Step 8: Commit and Push

```bash
git add -A
git commit -m "chore: prepare v0.7.0 release

- Bump app version to 0.7.0 (Cargo.toml)
- Bump client version to 1.2.0 (client/version.json)
- Bump web shell version to 1.1.0 (client/targets/web/version.json)
- Rebuild client bundles and regenerate types
- Add release notes"
git push origin main
```

---

### Step 9: Dispatch the Release Workflow

Go to **GitHub → Actions → Release → Run workflow**.

Set inputs:
- **channel**: `stable`
- **app**: `true` (build desktop artifacts)
- **client**: `true` (publish client update)
- **dry_run**: `false` (publish for real)
- **min_app_version**: leave empty

The workflow will:
1. **prepare** — read versions from `Cargo.toml` and `web/version.json`
2. **build** — compile desktop artifacts on 4 platforms (Linux deb/rpm/AppImage, macOS x64/arm64 DMG, Windows MSI/NSIS/portable)
3. **web** — build and package web extension + loader zips
4. **draft-release** — download artifacts, rename them, load release notes from `.github/release-notes/v0.7.0.md`, create a **draft** GitHub release with tag `v0.7.0`

**The release is a DRAFT at this point. Nothing is published yet.**

---

### Step 10: Review the Draft Release

Go to **GitHub → Releases**. You'll see a draft release `v0.7.0` with:
- Release notes from your `.md` file
- Desktop artifacts (8 files): `.dmg` (x64 + arm64), `.exe`, `.msi`, `.AppImage`, `.deb`, `.rpm`, portable archives
- Web extension: `yapmod_web_1.1.0.zip`
- Web loader: `yapmod_web_loader_1.1.0.zip`

Review the assets and description. Edit if needed.

---

### Step 11: Publish the Draft Release

Click **"Publish release"** on the draft.

This triggers the `release: published` event, which runs the **client** job in the workflow:
1. Checks out the `v0.7.0` tag
2. Builds the client bundles (desktop + web)
3. Preserves the nightly client feed unchanged
4. Packages and signs the stable client update manifest (Ed25519)
5. Packages and signs the stable web client update manifest
6. Updates legacy stable aliases (`client-updates/manifest.json`, etc.)
7. Deploys to GitHub Pages (website + client update feeds)

**After this step, v0.7.0 is live.** Desktop users on the stable channel will see the update. The stable client feed is updated. The nightly feed is untouched.

---

### Step 12: (Deferred) Upload Web Extension to Browser Stores

**Skipped for v0.7.0.** The workflow attaches `yapmod_web_1.1.0.zip` to the GitHub release but does **not** upload to Chrome Web Store or Firefox Add-ons. This will be done manually in a future release:
1. Download `yapmod_web_1.1.0.zip` from the release
2. Upload to Chrome Web Store developer console
3. Upload to Firefox Add-ons (AMO) developer hub
4. Wait for review and approval

---

### Dry Run (Testing Without Publishing)

To test the full pipeline without publishing:

1. Dispatch **Release** with `dry_run: true`
2. Artifacts are built and the manifest is signed, but nothing is uploaded or deployed
3. No draft release is created

To test the nightly path locally:
```bash
YAPMOD_UPDATE_CHANNEL=nightly pnpm tauri build
```

---

### What NOT to Do

- **Don't** push directly to `main` after the version bump commit — let the workflow run first
- **Don't** publish the draft before verifying the workflow succeeded
- **Don't** run a non-dry-run dispatch from a branch other than `main`
- **Don't** upload a nightly web extension zip to a browser store
- **Don't** edit `client/generated/types.ts` by hand — always use `pnpm types:generate`


# Delivery Steps

### ✓ Step 1: Draft the v0.7.0 release notes
Write `.github/release-notes/v0.7.0.md` based on the changes since v0.6.0, following the format of previous release notes (v0.6.0, v0.5.0). The draft covers all major categories: web extension, multi-target architecture, CI/CD overhaul, plugin/theme enhancements, documentation, and core fixes.

### ✓ Step 2: Provide the step-by-step release guide
Delivered the complete 12-step guide to the user. Browser store upload is deferred for v0.7.0.