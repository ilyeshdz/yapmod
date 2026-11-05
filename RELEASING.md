# Releasing yapmod

yapmod has two independent release channels. An installation belongs to the
channel it was built for and never switches channels through an update.

| Channel | Branch | Audience | Client update feed |
| --- | --- | --- | --- |
| Stable | `main` | Normal users; reliable releases and hotfixes | `/client-updates/stable/` |
| Nightly | `nightly` | Development and early testing | `/client-updates/nightly/` |

`main` is the stable branch. New development belongs on `nightly`. Nightly
automation never writes stable metadata or stable artifacts.

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

## How the channels are isolated

The desktop app resolves its channel at build time from
`YAPMOD_UPDATE_CHANNEL`. CI sets this to `stable` or `nightly`. Builds created
before the channel existed fall back to the `+nightly.*` build metadata in
their version, so an existing nightly installation never silently becomes
stable. A normal local build defaults to stable.

Each channel has its own:

- client update manifest: `client-updates/<channel>/manifest.json`
- signature: `client-updates/<channel>/manifest.sig`
- bundle: `client-updates/<channel>/bundle.json`
- cached update directory: `<config>/client-updates/<channel>/`
- release sequence: `releaseSequence` only advances within one channel
- app update source: stable uses the latest GitHub release; nightly uses the
  `yapmod-version.json` asset on the rolling `nightly` release

Stable releases also keep writing the old pre-channel paths
(`client-updates/manifest.json`, `manifest.sig`, `bundle.json`) so installations
that have not received an app update yet continue to receive stable client
updates. Nightly never writes those paths.

Both manifests carry a signed `channel` field, and each bundle carries the same
field. The app rejects a manifest or bundle whose channel does not match the
installation. A signed stable manifest cannot be replayed to a nightly client,
or the other way around.

## Publishing a nightly build

The `Nightly release` workflow runs daily and can be dispatched manually. It:

1. checks out the `nightly` branch;
2. builds nightly app artifacts and a nightly app version;
3. publishes the rolling `nightly` prerelease and its `yapmod-version.json`;
4. builds the client from `nightly` and publishes it under
   `client-updates/nightly/` and `client-updates-web/nightly/`.

Nightly artifacts also include two web extension zips,
`yapmod_web_nightly_<web_version>.zip` and
`yapmod_web_loader_nightly_<web_version>.zip`. They are not store builds: they
bundle the nightly client and are attached to the rolling prerelease only. Do
not upload a nightly package to a browser store.

The website files are always built from `main`, so nightly documentation or
website changes are not deployed by the nightly job. Only the nightly client
update feed changes.

Scheduled GitHub Actions workflows run from the repository's default branch,
so `nightly.yml` lives on `main` and explicitly checks out `nightly`. The
`nightly` branch must exist and contain the current channel-aware client code.

## Releasing stable

Stable releases still use the existing explicit release steps:

1. Make the stable changes on `main`.
2. Update the app version in `src-tauri/Cargo.toml`.
3. If the injected client changed, update `client/version.json`.
4. If the extension shell changed, update `client/targets/web/version.json`.
5. Push `main` and let the `Build` workflow produce artifacts.
6. Run the `Draft release` workflow from `main`. It downloads the latest
   successful stable build and creates a draft release for the version in
   `Cargo.toml`.
7. Review and publish the draft release.

Publishing the draft triggers `Publish client update` for the stable channel.
It checks out the release tag, builds the client, increments the stable
`releaseSequence`, signs the manifest, updates the stable feed, and keeps the
nightly feed unchanged.

To publish a client-only stable hotfix without a new desktop release, dispatch
`Publish client update` with:

- channel `stable`
- ref `main`
- the desired `min_app_version` when the change must not reach older apps

Leave `release_sequence` empty unless a specific value is required. The
workflow reads the currently published stable feed (and the legacy stable
aliases) and uses the next sequence.

## Releasing the web extension

The browser extension is a distribution of the same client. It shares the
release train: it is built from the same ref and embeds the same client version
as the desktop app and the signed client feed. The desktop and web client
bundles are still compiled per target, because each target embeds its own host
adapter.

`Publish client update` signs two feeds with the same key and envelope:

- `client-updates/<channel>/` for the desktop app.
- `client-updates-web/<channel>/` for the self-hosted web loader.

Both feeds are deployed with the website. They have independent release
sequences and independent `minAppVersion` values.

The `Build` workflow produces two web artifacts, and both release workflows
attach them:

| Artifact | Distribution | Client delivery |
| --- | --- | --- |
| `yapmod-web-extension` | Browser store | Embedded in the package |
| `yapmod-web-loader` | Self-hosted, unpacked, release zip | Signed web feed at runtime |

`Draft release` renames them to `yapmod_web_<web_version>.zip` and
`yapmod_web_loader_<web_version>.zip`. `Nightly release` attaches
`yapmod_web_nightly_<web_version>.zip` and
`yapmod_web_loader_nightly_<web_version>.zip`.

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

1. The bridge reads `client-updates-web/<channel>/` through the background
   worker.
2. It verifies the Ed25519 manifest signature, channel, expiry, release
   sequence, bridge API version and bundle hash.
3. It stages the verified `preinject` in `localStorage`.
4. The loader runs the staged bundle on the next page load.
5. A successful bootstrap confirms the bundle. An unconfirmed bundle is removed
   after one failed start, which rolls the client back to the embedded copy.

The loader is not store-compatible: browser store policy forbids executing
code that is downloaded at runtime. It also relies on the page's CSP allowing
the loader to inject the staged client; Yapper's current report-only policy
does, but a strict `script-src` could break it. Publish the loader as an
unpacked or self-hosted build only.

The bridge is part of the extension shell and never updates at runtime. A client
that needs a new bridge method must wait for a new shell version; the signed
manifest's `bridgeApiVersion` enforces that compatibility.

## Promoting nightly to stable

1. Merge `nightly` into `main`.
2. Bump the app version on `main` so the stable release supersedes the nightly
   builds it contains. Nightly uses `patch + 1` with `+nightly.*` metadata, and
   a stable release with the same core version is ordered after those nightlies.
3. Update `client/version.json` if the client changed.
4. Update `client/targets/web/version.json` if the extension shell changed.
5. Follow the stable release steps above.

Merging alone does not publish anything. The draft release is the explicit
promotion approval step. Changes on `main` do not flow back into `nightly`
automatically; merge `main` into `nightly` when a stable hotfix should also be
part of development.

## Testing without publishing

- `Publish client update` has a `dry_run` input. It still verifies the source
  branch, builds and signs the manifest, but does not upload or deploy the
  Pages artifact.
- `Nightly release` has a `dry_run` input that builds nightly artifacts without
  publishing a release or client update.
- Locally, build with
  `YAPMOD_UPDATE_CHANNEL=nightly pnpm tauri build` to exercise the nightly
  update path. Local builds without the variable use stable.
- Build the web loader with
  `YAPMOD_CLIENT_UPDATE_PUBLIC_KEY=<base64 key> pnpm client:package:web:loader`
  to exercise runtime client updates. A loader built without the key keeps
  working but only runs its embedded client.
- `pnpm test:scripts` tests the channel manifest tooling and the web packaging.
  `cargo test --manifest-path src-tauri/Cargo.toml` tests the Rust validation
  logic.

Never run a non-dry-run publication against a branch that does not belong to the
selected channel. The `Publish client update` workflow enforces this: stable
must be a commit on `main` (or a tag on `main`), and nightly must be the tip of
`nightly`.

## Required repository setup

- Branch `nightly` exists and is the development branch.
- Secret `CLIENT_UPDATE_SIGNING_KEY` contains the Ed25519 signing key.
- Variable `CLIENT_UPDATE_PUBLIC_KEY` contains the matching public key.
- The same key signs both channels; channel isolation comes from separate
  paths, manifests and signed channel fields.
- `main` remains the default branch so scheduled nightly automation can start
  from the workflow definitions on `main`.
