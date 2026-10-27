# Releasing yapmod

yapmod has two independent release channels. An installation belongs to the
channel it was built for and never switches channels through an update.

| Channel | Branch | Audience | Client update feed |
| --- | --- | --- | --- |
| Stable | `main` | Normal users; reliable releases and hotfixes | `/client-updates/stable/` |
| Nightly | `nightly` | Development and early testing | `/client-updates/nightly/` |

`main` is the stable branch. New development belongs on `nightly`. Nightly
automation never writes stable metadata or stable artifacts.

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
   `client-updates/nightly/`.

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
4. Push `main` and let the `Build` workflow produce artifacts.
5. Run the `Draft release` workflow from `main`. It downloads the latest
   successful stable build and creates a draft release for the version in
   `Cargo.toml`.
6. Review and publish the draft release.

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

## Promoting nightly to stable

1. Merge `nightly` into `main`.
2. Bump the app version on `main` so the stable release supersedes the nightly
   builds it contains. Nightly uses `patch + 1` with `+nightly.*` metadata, and
   a stable release with the same core version is ordered after those nightlies.
3. Update `client/version.json` if the client changed.
4. Follow the stable release steps above.

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
- `pnpm test:scripts` tests the channel manifest tooling. `cargo test
  --manifest-version src-tauri/Cargo.toml` tests the Rust validation logic.

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
