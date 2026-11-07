<div align="center">
  <img src="client/assets/icon.svg" alt="yapmod logo" width="128" />
  <h1>yapmod</h1>
  <p>A free, open-source desktop app for <a href="https://www.yapin.gg">Yapper</a> that you can shape to fit the way you use it.</p>

  <p>
    <a href="https://github.com/ilyeshdz/yapmod/releases"><img src="https://img.shields.io/github/v/release/ilyeshdz/yapmod?include_prereleases&label=version&color=f67567" alt="Version" /></a>
    <a href="https://github.com/ilyeshdz/yapmod/actions/workflows/ci.yml"><img src="https://github.com/ilyeshdz/yapmod/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-GPL%20v3-blue" alt="License" /></a>
  </p>
</div>

---

yapmod gives Yapper a real home on your desktop — a small, fast app you can extend with themes and plugins. Everything stays on your machine.

> An independent community project, not affiliated with Yapper.

## Themes

Change how Yapper looks without touching code. Browse the [community catalog](https://ilyeshdz.github.io/yapmod/docs/) or write your own CSS theme in minutes.

<!-- TODO: Add a screenshot showing two side-by-side themes (e.g., default vs. Mono Dark) -->
<!-- ![Theme comparison](images/themes.png) -->

Themes are CSS-only and installed locally. Your settings never leave your computer.

## Plugins

Extend what the app does. Community plugins can add new features, remove distractions, or tweak behavior — all with a toggle.

Some examples:

- **Popup Remover** — automatically dismisses promotional dialogs so they stop interrupting you.
- **Custom Background** — set a background image with blur, opacity, and accent color controls.

Plugins run trusted JavaScript in the page. Browse or submit plugins on the [community catalog](https://ilyeshdz.github.io/yapmod/docs/).

<!-- TODO: Add a screenshot showing the plugin settings UI -->
<!-- ![Plugin settings](images/plugins.png) -->

## A smaller footprint

yapmod uses the webview your operating system already includes instead of bundling a full browser. The download is small, the app starts fast, and it uses less memory.

## Installation

Download the latest build from the [Releases](https://github.com/ilyeshdz/yapmod/releases) page:

| Platform | Format |
|----------|--------|
| **Windows** | `.exe` installer, `.msi`, or portable `.zip` |
| **macOS** | `.dmg` (Apple Silicon and Intel) |
| **Linux** | `.AppImage`, `.deb`, `.rpm`, or portable `.tar.gz` |

Want to try in-progress changes before they ship? Grab the [nightly build](https://github.com/ilyeshdz/yapmod/releases/tag/nightly). Nightly updates daily and may be unstable.

> **macOS:** builds are ad-hoc signed but not notarized. On first launch, right-click the app and choose **Open**, or allow it in **System Settings → Privacy & Security**.

## Documentation

Installation guides, theme and plugin tutorials, and troubleshooting live at [ilyeshdz.github.io/yapmod/docs](https://ilyeshdz.github.io/yapmod/docs/).

## Community

Join the conversation on the official Yapper server: [yapin.gg/invite/develop](https://www.yapin.gg/invite/develop)

## Contributing

Contributions are welcome. For larger changes, open an issue first so we can discuss the approach. Keep pull requests focused and consistent with the existing code.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

<div align="center">
  <p style="color: #888; font-size: 0.9em;">Unofficial project · Not affiliated with Yapper</p>
</div>
