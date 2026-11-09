# Releasing yapmod

yapmod builds everything from one branch, `main`, and ships a single stable
release channel. There is no nightly channel: a release is an explicit action,
and every installation follows the same signed feed.

## Version model

yapmod has three version numbers. They move independently, but every release is
built from one commit, so a released client version is the same code on every
surface that ships it.

| Version | Source | Describes |
| --- | --- | --- |
| App version | `src-tauri/Cargo.toml` | Tauri desktop shell |
| Client version | `client/version.json` | Injected client (`preinject`, `postinject`, CSS) |
| Web version | `client/targets/web/version.json` | Extension package: manifest, bridge, background |

A release is built from a single ref. The desktop app embeds the client, the web
extension embeds the client, and the signed client feed publishes the client.
Because the hosts are compiled per target, the desktop and web client bundles are
built from the same source and version but are not byte-identical.

Bump the client version when the injected code changes. Bump the web version when
the extension shell changes: a new permission, a new bridge method, or a change
to `manifest.json`. A client-only change does not require a new web version.

Web versions must be a numeric dotted version (`1.0.0`, `1.0.1.2`). Browser
stores reject semver prerelease and build metadata, so `+nightly` cannot appear
in `manifest.json`.

## The client update feed

Every build consumes the same signed feed:

- desktop manifest: `client-updates/stable/manifest.json`
- desktop signature: `client-updates/stable/manifest.sig`
- desktop bundle: `client-updates/stable/bundle.json`
- cached update directory: `<config>/client-updates/stable/`
- web feed: `client-updates-web/stable/` with its own manifest, signature,
  bundle, release sequence and `minAppVersion` (the web shell version)
- app updates: the latest GitHub release

The feed also keeps writing the old pre-versioning paths
(`client-updates/manifest.json`, `manifest.sig`, `bundle.json`) so installations
that have not received an app update yet continue to receive client updates.

Manifests and bundles carry a signed `channel` field with the value `stable`.
The app rejects a manifest or bundle whose channel does not match, which keeps
older installations compatible with the current feed.

## The release workflow

`.github/workflows/release.yml` runs on manual dispatch or when a release is
published.

Manual dispatch inputs:

| Input | Meaning |
| --- | --- |
| `app` | Build and publish desktop artifacts |
| `client` | Publish a client update |
| `dry_run` | Build and sign without publishing anything |
| `min_app_version` | Optional minimum app version for a client-only release |

### Publishing a release

1. Make the change on `main`.
2. Update the app version in `src-tauri/Cargo.toml`.
3. If the injected client changed, update `client/version.json`.
4. If the extension shell changed, update `client/targets/web/version.json`.
5. Add the release entry to `src-tauri/assets/release-notes.json` (for the in-app UI)
   and `CHANGELOG.md` (for GitHub visitors).
6. Push `main`.
7. Dispatch `Release` with `app: true`, `client: true`.
   It builds the artifacts and creates a **draft** release for the version in
   `Cargo.toml`.
8. Review and publish the draft release.

Publishing the draft triggers the client update: the workflow checks out the
release tag, builds the client, increments the `releaseSequence`, signs the
manifest, updates the feed, and refreshes the legacy aliases.

To publish a client-only update without a new desktop release, dispatch
`Release` with:

- `app: false`
- `client: true`
- `min_app_version` when the change must not reach older apps

## Releasing the web extension

The browser extension is a distribution of the same client. It is built from the
same ref and embeds the same client version as the desktop app and the signed
client feed. The desktop and web client bundles are still compiled per target,
because each target embeds its own host adapter.

`prepare` signs two feeds with the same key and envelope:

- `client-updates/stable/` for the desktop app.
- `client-updates-web/stable/` for the self-hosted web loader.

The `Build` workflow produces two web artifacts, and the release workflow
attaches them:

| Artifact | Distribution | Client delivery |
| --- | --- | --- |
| `yapmod-web-extension` | Browser store | Embedded in the package |
| `yapmod-web-loader` | Self-hosted, unpacked, release zip | Signed web feed at runtime |

`Draft release` renames them to `yapmod_web_<web_version>.zip` and
`yapmod_web_loader_<web_version>.zip`.

To produce a package locally:

1. Update `client/version.json` when the client changes.
2. Update `client/targets/web/version.json` when the shell changes.
3. Run `pnpm client:package:web` for the store package, or
   `pnpm client:package:web:loader` for the loader. Both write a zip to `dist/`
   with the manifest at the archive root.
4. Build the loader with `YAPMOD_CLIENT_UPDATE_PUBLIC_KEY` set to the repository
   variable. Without the key the loader falls back to the embedded client and
   never updates.
5. Test the package by loading `dist/web` or `dist/web-loader` as an unpacked
   extension in a fresh browser profile.
6. Upload to the browser store manually. No workflow publishes to a store.

`node scripts/check-web-bundle.mjs` verifies both manifests, the per-target
version reporting, and that only the loader requests the update feed.
`pnpm check` runs it.

### How each web build updates

A store build embeds the client and is updated by the browser. A client-only
change still needs a new extension package, because a store build must contain
the client code.

The loader build embeds the client for a fresh install and also consumes the
signed web feed:

1. The bridge reads `client-updates-web/stable/` through the background worker.
2. It verifies the Ed25519 manifest signature, expiry, release sequence,
   bridge API version and bundle hash.
3. It stages the verified `preinject` in `localStorage`.
4. The loader runs the staged bundle on the next page load.
5. A successful bootstrap confirms the bundle. An unconfirmed bundle is removed
   after one failed start, which rolls the client back to the embedded copy.

The loader is not store-compatible: browser store policy forbids executing
code that is downloaded at runtime. It also relies on the page's CSP allowing
the loader to inject the staged client; Yapin's current report-only policy
does, but a strict `script-src` could break it. Publish the loader as an
unpacked or self-hosted build only.

The bridge is part of the extension shell and never updates at runtime. A client
that needs a new bridge method must wait for a new shell version; the signed
manifest's `bridgeApiVersion` enforces that compatibility.

## Testing without publishing

- Both the app and client parts honour `dry_run`. Artifacts are built and the
  manifest is signed, but nothing is uploaded or deployed.
- Locally, build the client with `pnpm client:build` and the app with
  `pnpm tauri build`.
- Build the web loader with
  `YAPMOD_CLIENT_UPDATE_PUBLIC_KEY=<base64 key> pnpm client:package:web:loader`
  to exercise runtime client updates. A loader built without the key keeps
  working but only runs its embedded client.
- `pnpm test:scripts` tests the feed manifest tooling and the web packaging.
  `cargo test --manifest-path src-tauri/Cargo.toml` tests the Rust validation
  logic.

Never run a non-dry-run publication from a commit that is not on `main`. The
workflow enforces this.

## Required repository setup

- `main` is the default branch.
- Secret `CLIENT_UPDATE_SIGNING_KEY` contains the Ed25519 signing key.
- Variable `CLIENT_UPDATE_PUBLIC_KEY` contains the matching public key.
- The same key signs both the desktop and web feeds.
