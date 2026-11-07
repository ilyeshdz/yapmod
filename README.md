<div align="center">
  <img src="client/assets/icon.svg" alt="yapmod logo" width="160" />
  <h1>yapmod</h1>
  <p><strong>Yapper, made yours.</strong></p>
  <p>A free, open-source desktop app for <a href="https://www.yapin.gg">Yapper</a> that gives you a dedicated window, native integration, and the ability to customize everything.</p>

  <p>
    <a href="https://github.com/ilyeshdz/yapmod/releases"><img src="https://img.shields.io/github/v/release/ilyeshdz/yapmod?include_prereleases&label=app%20version&color=f67567" alt="App version" /></a>
    <a href="https://github.com/ilyeshdz/yapmod/actions/workflows/ci.yml"><img src="https://github.com/ilyeshdz/yapmod/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-GPL%20v3-blue" alt="License: GPL v3" /></a>
  </p>
</div>

---

yapmod is a lightweight desktop client built with [Tauri](https://tauri.app) — it uses the webview your system already ships instead of bundling a full browser, so the download is small and the app stays fast.

It's an independent community project, not affiliated with Yapper. The official team has their own desktop app; yapmod exists for people who want something lightweight, customizable, and open source.

## Features

- **A desktop app that feels at home** — dedicated window, system notifications, unread badge, and an optional tray icon to keep yapmod running in the background.
- **Make it yours** — choose a theme or create your own with CSS. Your settings and themes stay on your computer.
- **Open source, across platforms** — available for Windows, macOS, and Linux. The project is public, so you can see how it works and help shape what comes next.

## Installation

Grab the latest build from the [Releases](https://github.com/ilyeshdz/yapmod/releases) page:

| Platform | Format |
|----------|--------|
| **Windows** | `.msi` installer or NSIS `.exe` |
| **macOS** | `.dmg` (Intel and Apple Silicon) |
| **Linux** | `.deb`, `.rpm`, or `.AppImage` |

These builds follow the **stable** channel. To try changes before they ship, install the [nightly prerelease](https://github.com/ilyeshdz/yapmod/releases/tag/nightly) instead. Nightly builds update from the nightly feed only and are replaced each day. An installation stays on the channel it was built for; switching requires installing a build from the other channel.

> **macOS note:** builds are ad-hoc signed but not notarized. On first launch, right-click the app and choose **Open**, or allow it in **System Settings → Privacy & Security**.

## Documentation

Installation guides, themes, troubleshooting, and contribution docs live at [ilyeshdz.github.io/yapmod/docs](https://ilyeshdz.github.io/yapmod/docs/).

## Community

Join the official Yapper server: [yapin.gg/invite/develop](https://www.yapin.gg/invite/develop)

## Contributing

Contributions are welcome. Since the project is early in development, please open an issue to discuss larger changes before starting work, and keep pull requests focused and consistent with the existing code.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

<div align="center">
  <p style="color: #888; font-size: 0.9em;">Unofficial project · Not affiliated with Yapper</p>
</div>
