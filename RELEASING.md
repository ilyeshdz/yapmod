# Releasing yapmod

yapmod builds everything from one branch, `main`. Two release channels remain:
an installation belongs to the channel it was built for and never switches
channels through an update.

| Channel | Source | Audience | Client update feed |
| --- | --- | --- | --- |
| Stable | `main` | Normal users; reliable releases and hotfixes | `/client-updates/stable/` |
| Nightly | `main` | Development and early testing | `/client-updates/nightly/` |

Nightly is a scheduled build of `main`, not a separate source branch. Nightly
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

## The release workflow

`.github/workflows/release.yml` handles both channels. It runs:

- daily at `17 2 * * *` as a nightly release;
- on manual dispatch, where you choose the channel;
- when a stable draft release is published.

Manual dispatch inputs:

| Input | Meaning |
| --- | --- |
| `channel` | `stable` or `nightly` |
| `app` | Build and publish desktop artifacts |
| `client` | Publish a client update |
| `dry_run` | Build and sign without publishing anything |
| `min_app_version` | Optional minimum app version for a client-only release |

### Nightly

The scheduled run, or a dispatch with `channel: nightly`:

1. computes `patch + 1` and `+nightly.YYYYMMDD.RUN` from
   `src-tauri/Cargo.toml`;
2. builds the app artifacts with `YAPMOD_UPDATE_CHANNEL=nightly`;
3. moves the rolling `nightly` tag and publishes the prerelease plus
   `yapmod-version.json`;
4. builds the client from `main` and publishes it under
   `client-updates/nightly/`.

The website files are always built from `main`, so the nightly job only
updates the nightly client feed.

### Stable

1. Make the stable change on `main`.
2. Update the app version in `src-tauri/Cargo.toml`.
3. If the injected client changed, update `client/version.json`.
4. Push `main`.
5. Dispatch `Release` with `channel: stable`, `app: true`, `client: true`.
   It builds the artifacts and creates a **draft** release for the version in
   `Cargo.toml`.
6. Review and publish the draft release.

Publishing the draft triggers the stable client update: the workflow checks out
the release tag, builds the client, increments the stable `releaseSequence`,
signs the manifest, updates the stable feed, and keeps the nightly feed
unchanged.

To publish a client-only stable update without a new desktop release, dispatch
`Release` with:

- `channel: stable`
- `app: false`
- `client: true`
- `min_app_version` when the change must not reach older apps

## Testing without publishing

- Both the app and client parts honour `dry_run`. Artifacts are built and the
  manifest is signed, but nothing is uploaded or deployed.
- Locally, build with
  `YAPMOD_UPDATE_CHANNEL=nightly pnpm tauri build` to exercise the nightly
  update path. Local builds without the variable use stable.
- `pnpm test:scripts` tests the channel manifest tooling.
  `cargo test --manifest-path src-tauri/Cargo.toml` tests the Rust validation
  logic.

Never run a non-dry-run publication from a commit that is not on `main`. The
workflow enforces this for both channels.

## Required repository setup

- `main` is the default branch.
- Secret `CLIENT_UPDATE_SIGNING_KEY` contains the Ed25519 signing key.
- Variable `CLIENT_UPDATE_PUBLIC_KEY` contains the matching public key.
- The same key signs both channels; channel isolation comes from separate
  paths, manifests and signed channel fields.
