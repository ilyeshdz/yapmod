# Flatpak Support for yapmod

This directory contains the files needed to package yapmod as a Flatpak for distribution on [Flathub](https://flathub.org).

## Files

| File | Purpose |
|------|---------|
| `io.ilyeshdz.yapmod.yml` | Flatpak manifest (build instructions) |
| `io.ilyeshdz.yapmod.metainfo.xml` | AppStream metadata (software center listing) |
| `io.ilyeshdz.yapmod.desktop` | Desktop entry (application menu) |

## Current Approach: .deb Extraction

The current manifest uses the **.deb extraction** approach. It downloads the pre-built `.deb` from GitHub releases, extracts it, and installs the binary and assets in the Flatpak sandbox.

### Pros
- Simple manifest — no Rust/Node SDK needed in sandbox
- Very fast Flatpak build (just extract and install)
- No offline dependency generation

### Cons
- The `.deb` must be built on Ubuntu 22.04 (oldest glibc you want to support)
- WebKit2GTK version is frozen to whatever's in Ubuntu 22.04
- Requires hosting the `.deb` at a stable URL (GitHub releases work)

## Automated Flatpak Build (GitHub Actions)

The `.github/workflows/flatpak.yml` workflow automatically builds the Flatpak package:

- **On release publish**: Downloads the `.deb` from the GitHub release, builds the Flatpak, and uploads it back to the same release as `yapmod_<version>_flatpak.x86_64.flatpak`.
- **On manual dispatch**: Builds the Flatpak using the current `Cargo.toml` version and uploads it as a workflow artifact. Use the `dry_run` option to build without publishing.

To trigger manually, go to **Actions → Flatpak → Run workflow**.

The workflow works with a copy of the manifest files, so the committed files in this directory are never modified by CI.

## Building Locally

Prerequisites:
- `flatpak` and `flatpak-builder` installed
- Flathub remote added: `flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo`

```bash
# Update the .deb URL and SHA256 in io.ilyeshdz.yapmod.yml first
flatpak-builder --force-clean --user --repo=repo --install builddir flatpak/io.ilyeshdz.yapmod.yml
```

## Submitting to Flathub

1. Fork [flathub](https://github.com/flathub/flathub) on GitHub
2. Clone and create a new PR branch:
   ```bash
   git clone --branch=new-pr git@github.com:<your-user>/flathub.git
   cd flathub
   git checkout -b io.ilyeshdz.yapmod
   ```
3. Create the app directory and copy files:
   ```bash
   mkdir io.ilyeshdz.yapmod
   cp flatpak/io.ilyeshdz.yapmod.yml io.ilyeshdz.yapmod/
   cp flatpak/io.ilyeshdz.yapmod.metainfo.xml io.ilyeshdz.yapmod/
   ```
4. Commit and push:
   ```bash
   git add io.ilyeshdz.yapmod/
   git commit -m "new app: io.ilyeshdz.yapmod"
   git push origin io.ilyeshdz.yapmod
   ```
5. Create a PR against the `new-pr` branch of `flathub/flathub`
6. The Flathub team will review and may request changes (screenshots, license, etc.)

## Filesystem Access for Plugins

yapmod plugins may need to access files that users select through file dialogs. The Flatpak sandbox handles this securely:

- **No broad filesystem access**: The app does NOT have `--filesystem=` permissions that would grant access to the entire home directory or other system paths.
- **XDG Desktop Portal**: File chooser dialogs are handled by the XDG Desktop Portal, which presents a file picker to the user. Only files explicitly selected by the user are accessible.
- **Tauri dialog plugin**: The `tauri-plugin-dialog` dependency in yapmod uses these portals automatically in Flatpak environments.

This means plugins can safely use file open/save dialogs without requiring broad sandbox permissions.

## Future: Source Build Approach

For a more robust long-term solution, you can migrate to building from source inside the Flatpak sandbox. This provides:

- App compiled against the GNOME SDK's WebKit2GTK (no glibc version mismatches)
- Up-to-date WebKit in the Flatpak runtime
- Fully reproducible builds; Flathub builds from source

To migrate:
1. Add `flatpak-builder-tools` as a git submodule:
   ```bash
   git submodule add https://github.com/flatpak/flatpak-builder-tools.git flatpak-builder-tools
   ```
2. Generate offline dependency manifests:
   ```bash
   # Node sources
   cd flatpak-builder-tools/node/
   flatpak_node_generator --no-requests-cache -o flatpak/node-sources.json pnpm-lock.yaml

   # Cargo sources
   python3 flatpak-builder-tools/cargo/flatpak-cargo-generator.py \
     -o flatpak/cargo-sources.json src-tauri/Cargo.lock
   ```
3. Update the manifest to use the source-build approach (see the generated template in the GitHub issue discussion)

## App ID

The Flatpak app ID is `io.ilyeshdz.yapmod`, which matches the Tauri identifier in `tauri.conf.json`.

## Runtime

The manifest targets GNOME Platform 47, which provides a modern WebKit2GTK version. Flathub will have this runtime available.

## References

- [Flathub Developer Documentation](https://docs.flathub.org/)
- [Flatpak Manifest Format](https://docs.flatpak.org/en/latest/manifests.html)
- [AppStream Metadata Specification](https://www.freedesktop.org/software/appstream/docs/)
- [Tauri on Linux](https://tauri.app/distribute/linux/)
