# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Automatic app updates with background checking. The app checks for updates every 6 hours with exponential backoff on failure, downloads and installs updates silently, and shows a notification when a new version is available. CI generates signed updater manifests published via GitHub Pages (#25).
- Settings export and import feature. On desktop, export opens a native save dialog so users can choose the file name and location; web falls back to an automatic download. Import validates the file format and shows clear errors on invalid input (#46).
- Keyboard shortcut API reference page documenting how to register, scope, and clean up keyboard event listeners in plugins (#42).
- Expanded plugin API documentation with threat model, CSS scoping patterns, plugin interaction model, and additional examples (#42).
- Plugin and theme update detection from the community catalog. Installed plugins and themes are compared against the catalog on load, and an update button appears on cards when a newer version is available (#44).
- Interactive, WebGL-rendered dithered grid in the landing page hero that follows the pointer, inspired by the banner art, with theme-aware colors plus reduced-motion, visibility, and no-WebGL fallbacks (#70).
- Structured error types for Tauri commands. All Tauri commands now return a structured `YapmodError` enum (`NotFound`, `Validation`, `Io`, `Network`, `AlreadyExists`, `System`) instead of plain strings, so the client can distinguish error categories programmatically (#48).
- Flatpak packaging support for Flathub distribution. The app can now be installed via Flatpak using a `.deb` extraction approach — the manifest downloads the pre-built `.deb` from GitHub releases and installs it in the Flatpak sandbox. Includes AppStream metadata for software center listing, desktop entry with proper categories, and a dedicated CI workflow for building and publishing to Flathub (#24).

### Changed

- `tokio-tungstenite` now uses `rustls-tls` instead of `native-tls`, unifying the TLS implementation across the project to a single `rustls` backend (#45).
- Shared helper functions for subscription management, handler notification, and ArrayBuffer copying are extracted from the HTTP and WebSocket inspectors into a common module, eliminating duplicated code (#68).
- The `isRecord` type guard is extracted from three files into the shared helpers module, eliminating duplication (#68).
- Plugin setting validation now reports specific, actionable error messages identifying each setting and its exact problem (#68).
- Several code patterns are simplified for clarity: `extractHeaders` uses `Headers.entries()`, `storedRecord` uses the shared `isRecord` helper, string concatenation is replaced with template literals, and hex conversion uses `Array.from` (#68).

### Fixed

- Picked plugin and theme folder paths now expire after 30 seconds and are cleared when the picker is cancelled, preventing stale paths from being used on subsequent install operations (#54).

### Removed

- The nightly release channel and its scheduled builds, nightly-only update feeds, version ordering, and release workflow plumbing. yapmod now ships a single stable channel, which also simplifies the signed client update feed and the web loader to one path and one cache key (#72).

## [0.7.0] - 2026-11-05

### Added

- Browser extension support - run Yapmod as a Chrome or Firefox extension with isolated bridge, `chrome.storage.local` storage, and signed client updates at runtime, plus a separate self-hosted loader build for private deployments.
- Plugin UI component system with styled buttons, icons, and layout utilities for custom plugin UI, plus custom settings panels in the Yapmod settings sidebar.
- Mono Dark community theme - a monochrome dark theme with subtle beige accent and custom font import.

### Changed

- Multi-target client architecture - the client is restructured around a unified host contract with message ports instead of direct platform calls, sharing feature logic between desktop and browser extension targets.
- Plugin and theme reload without restarting the app, with plugins automatically re-enabled after reload.
- Theme accent colors now map to Yapper's primary host CSS variables for better visual integration.
- Settings are backed up to `localStorage` on app close to prevent loss on unexpected close.
- Plugin restore properly waits for document body, fixing a startup race condition.
- Custom settings panels from plugins render at the bottom of the settings sidebar in the correct order.
- Custom Background plugin supports opacity control for background images.
- Notification delivery and link opening improved across platforms.
- CI/CD pipeline consolidated from seven workflow files into two, handling stable/nightly channels, desktop builds on four platforms, web extension packaging, and signed client update feed publication.
- Unified build script handles client bundling, type generation, version management, web extension packaging, and bundle validation.
- Documentation site now has client-side routing, search palette, and 22 new pages covering plugin API, theme development, architecture guides, and web extension with auto-generated API reference data.
- Community plugin catalog includes Popup Remover plugin (PR #19) and Mono Dark theme, with automatic generation and validation infrastructure.
- Plugin and theme validation in Rust backend simplified with trusted boundary, allowing external resources like fonts and images in CSS.

### Fixed

- Deadlock in client update concurrency group and missing `OUTPUT_DIR` variable that could block releases.

### Removed

- Yaplay integration has been removed from the project.

## [0.6.0] - 2026-10-27

### Added

- Community themes support through the Community Themes section, with documentation for creating and publishing themes.
- Plugin system with dedicated plugin API for extending Yapmod, including community distribution process (experimental).
- Custom Background community plugin for customizing the application's background with images and accent colors.

### Changed

- The injected client now uses Solid.js for UI components and DOM updates instead of native DOM manipulation, simplifying UI development and maintenance.
- Styles moved from JavaScript files to dedicated CSS files, with broader cleanup improving client structure.
- macOS interface adjustments for better platform integration.
- Stable and nightly releases now have independent client update channels, similar to Discord's stable and Canary clients.
- The main branch is dedicated to stability, security fixes, hotfixes, and maintenance without new experimental features.
- The nightly branch is dedicated to ongoing development with automated daily builds for testing.

## [0.5.0] - 2026-10-24

### Added

- Client bundle support separate from desktop app releases, with signed manifest verification, bundle hash checking, app compatibility verification, and staged updates with restart option and rollback on failure.
- Minimize, maximize/restore, and close controls in Yapin's top bar on Windows, with macOS window drag area support.
- Compact notification banners in Yapin's top bar.

### Fixed

- Windows startup issue preventing settings interface from loading - client now waits for document root and head before installing observers and styles.
- Theme initialization waits for document root, and injected styles wait for page head for more reliable startup styling.
- Settings navigation freezes from repeated event listeners and mutation observer loop, with icons added to settings sections.
- Yapin integration updated for yapin.gg, including supported bare and www addresses.

### Changed

- Daily and manually triggered nightly builds published as rolling prereleases for testing.
- Injected client moved to `client/` directory with versioned, signed client release tooling (embedded client version 1.0.2).
- Project checks unified, app build workflow shared between stable and nightly packages, with improved portable and Windows MSI version handling. Removed unused Vite scaffolding and updated documentation.

## [0.4.1] - 2026-10-22

### Fixed

- Theme mode changes now update active styles without reloading the page.

## [0.4.0] - 2026-10-22

### Added

- System tray support to keep yapmod running in the background when its window is closed, continuing desktop notifications while the window is hidden (macOS, Windows, and Linux with tray indicators).
- Custom theme loading from dedicated folders with CSS file and `manifest.json`, documented on the documentation site.

## [0.3.1] - 2026-10-21

### Added

- Desktop notifications option and Show the unread badge option in the yapmod settings section.
- Clicking a notification brings yapmod to the front and opens the related message.

### Fixed

- Desktop notifications now show in the system notification center, as the webview cannot post them directly.
- Unread message count now appears on the app icon (Dock, taskbar, and panel).

## [0.3.0] - 2026-10-21

### Added

- Unread and mention badges on servers and channels, with desktop notifications and notification sounds on Windows, macOS, and Linux.
- Voice call support on macOS with microphone access on first join.
- Update checking with notice when a newer version is available.
- Changelog view in settings for reading release notes from inside the app.
- Documentation site with full-text search for setup, troubleshooting, FAQ, and developer docs.

### Fixed

- Previous settings panel no longer stays visible when switching sections.
- Settings from older yapmod versions migrate correctly, preserving window options across updates.
- Linux app now uses the proper Tux icon.

## [0.2.0] - 2026-10-20

### Added

- Yapmod section in Yapin's settings for desktop options alongside the rest of the app.
- Official landing page with direct download links for macOS, Windows, and Linux.
- Native titlebar and start-maximized options toggleable from settings, applying on next launch.
- Settings stored in config file, writable from the injected page.
- Release notes modal showing version, release date, and changelog for every past release.

### Changed

- External links now open in the default browser instead of inside the app.

### Fixed

- Following a link to another site no longer opens a broken window inside the desktop client.

## [0.1.2] - 2026-10-20

### Added

- Release notes appear after an update to show what changed.
- Last run version saved in config file.

### Fixed

- macOS builds are now ad-hoc signed to prevent damaged app warnings.
- Login screen opens when not signed in.
- README and release workflow improved.

## [0.1.1] - 2026-10-20

### Added

- Reusable modal API for injected scripts.
- Welcome modal shown on first launch.
- Config file with options for native titlebar and starting maximized.

## [0.1.0] - 2026-10-20

### Added

- Yapin runs in its own desktop window.
- Custom macOS titlebar overlay.
- The yapmod logo and desktop icons.

<!-- Version comparison links -->

[Unreleased]: https://github.com/ilyeshdz/yapmod/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ilyeshdz/yapmod/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ilyeshdz/yapmod/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ilyeshdz/yapmod/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/ilyeshdz/yapmod/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/ilyeshdz/yapmod/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ilyeshdz/yapmod/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ilyeshdz/yapmod/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ilyeshdz/yapmod/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/ilyeshdz/yapmod/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ilyeshdz/yapmod/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ilyeshdz/yapmod/releases/tag/v0.1.0
