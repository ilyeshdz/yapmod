---
title: Install yapmod
group: Start
order: 2
eyebrow: Start here
description: Download and install the build for your platform.
---

Download the latest build from the [Releases page](https://github.com/ilyeshdz/yapmod/releases).

| System | Formats |
| --- | --- |
| Windows | `.msi` installer, NSIS `.exe` installer, or a portable `.zip` |
| macOS | `.dmg` for Apple Silicon and Intel |
| Linux | `.deb`, `.rpm`, `.AppImage`, or a portable `.tar.gz` |

## Windows

Run either installer and follow its prompts. The portable `.zip` runs from a folder without installation.

## macOS

Open the `.dmg` and drag yapmod into Applications.

> **First launch on macOS**
> Builds are ad-hoc signed but not notarized. On the first launch, right-click the app and choose **Open**, or allow it in **System Settings > Privacy & Security**.

## Linux

Pick the package for your distribution. Adjust the file name in these commands when necessary.

```bash
# Debian, Ubuntu
sudo dpkg -i yapmod*.deb

# Fedora, openSUSE
sudo rpm -i yapmod*.rpm

# Any distribution
chmod +x yapmod*.AppImage
./yapmod*.AppImage
```

> **AppImage on recent Wayland distributions**
> The AppImage may crash or display a blank window on recent Fedora releases and some other Wayland-based distributions because of a conflict between bundled Wayland libraries and the system graphics stack. Use the `.rpm` package on Fedora or the `.deb` package on Debian and Ubuntu. See [Troubleshooting](/docs/troubleshooting/#it-crashes-or-shows-a-blank-window-on-fedora-or-another-recent-wayland-distribution) for details.

To update, install a newer build over the existing one. Your settings are kept.
