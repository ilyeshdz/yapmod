# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Development and infrastructure

- **Structured error types for Tauri commands.** All Tauri commands now return a structured `YapmodError` enum (`NotFound`, `Validation`, `Io`, `Network`, `AlreadyExists`, `System`) instead of plain strings, so the client can distinguish error categories programmatically. (#48)

## [0.7.0] - 2026-11-05

### Highlights

- **Browser extension.** You can now run Yapmod as a Chrome or Firefox extension. It loads the client behind an isolated bridge, stores plugins and themes in `chrome.storage.local`, and supports signed client updates at runtime. There is also a separate self-hosted loader build for private deployments.
- **Multi-target client architecture.** The client has been restructured around a unified host contract. Feature code talks to the host through message ports instead of making direct platform calls, so both the desktop app and the browser extension share the same feature logic. Each target implements its own host, and tests enforce the boundaries.
- **Plugin UI component system.** Plugins can build custom UI using a built-in component library with styled buttons, icons, and layout utilities. They can also register custom settings panels that show up in the Yapmod settings sidebar.
- **Plugin reload.** Installed plugins and themes can be reloaded without restarting the app, and plugins are automatically re-enabled after a reload.
- **Mono Dark community theme.** A new monochrome dark theme with a subtle beige accent and custom font import. Theme accent colors now map to Yapper's primary host CSS variables for better visual integration.

### Improvements and fixes

- **Settings persistence.** Settings are backed up to `localStorage` on app close, so you do not lose them if the app closes unexpectedly.
- **Plugin restore.** Plugins are properly restored after the document body exists, fixing a race condition during startup.
- **Custom settings positioning.** Custom settings panels from plugins now render at the bottom of the settings sidebar in the right order.
- **Custom background opacity.** The Custom Background plugin now supports opacity control for background images.
- **Notification and link handling.** Notification delivery and link opening work better across platforms.
- **Client release fixes.** Fixed a deadlock in the client update concurrency group and a missing `OUTPUT_DIR` variable that could block releases.

### Development and infrastructure

- **Web extension target.** A full browser extension shell has been added, with a page-realm bridge, extension storage backend, plugin and theme import, an RPC layer, manifest, and background service worker. The extension has its own version, separate from the app and client versions.
- **CI/CD pipeline overhaul.** The release workflow was rewritten from scratch, consolidating seven workflow files into two. The unified pipeline handles stable and nightly channels, desktop builds on four platforms, web extension packaging, and signed client update feed publication, all from a single workflow dispatch.
- **Unified build tooling.** One build script now handles client bundling, type generation, and version management, replacing the old separate scripts. Web extension packaging and bundle validation are included too.
- **Documentation improvements.** The docs site now has client-side routing, a search palette, and 22 new pages covering the plugin API, theme development, architecture guides, and the web extension. API reference data is auto-generated from the codebase.
- **Plugin and theme ecosystem.** The community plugin catalog now includes the Popup Remover plugin (contributed via PR #19). The theme catalog includes Mono Dark. Catalog infrastructure supports automatic generation and validation.
- **Simplified Rust validation.** Plugin and theme validation in the Rust backend has been simplified since the boundary is trusted, removing duplicated policy rules. External resources like fonts and images are now allowed in plugin and theme CSS.
- **Yaplay integration removed.** The Yaplay integration has been removed from the project.

## [0.6.0] - 2026-10-27

### Highlights

- Community themes are now supported through the Community Themes section. You can create your own themes and publish them for others to discover and use. The Yapmod website includes documentation explaining how to create a theme and submit it to the community collection.
- The plugin system is now officially available, allowing developers to extend Yapmod using a dedicated plugin API. Community plugins can be published through a process similar to community themes. The system is still experimental, and the API documentation is currently minimal. Both the API and its documentation will continue to evolve as the system matures.
- The first community plugin is already available: Custom Background. It lets you customize the application's background with an image of your choice and change the accent color. This plugin was developed to make extensive use of the new plugin API and serves as an initial example of what developers can build with it.

### Improvements and fixes

- The injected client has undergone a major internal refactor. Previously, much of the interface was built using native DOM manipulation and manually constructed strings. The client now uses Solid.js to handle UI components and DOM updates in a more structured way. This simplifies UI development and makes the codebase easier to maintain.
- Styles that were previously embedded in JavaScript files have been moved into dedicated CSS files. The broader cleanup also removes unnecessary complexity and improves the structure of the client, laying the groundwork for more reliable future development.
- Several adjustments have been made to improve the interface on macOS, continuing the work on making Yapmod feel more integrated with the platform.

### Development and infrastructure

- Stable and nightly releases now have independent client update channels, following an approach similar to Discord's stable and Canary clients. Previously, publishing a stable client update could depend on changes that were only available in the nightly development branch. Separating the two channels removes this dependency and allows each to evolve independently.
- The main branch is now dedicated to stability, security fixes, hotfixes, and maintenance. It will not receive new experimental features as part of the normal development process. This keeps stable releases focused on reliability.
- The nightly branch is dedicated to ongoing development and new features. Automated builds are published daily, giving users and developers access to the latest changes before they reach the stable channel. Nightly builds may be unstable and are intended for testing.
- The plugin infrastructure is now in place, including an API designed specifically for plugin development and a community distribution process. However, the system is still experimental. Expect further improvements to the API, additional documentation, and changes as development continues.

## [0.5.0] - 2026-10-24

### Highlights

- Yapmod now supports client bundles published separately from desktop app releases. When a compatible update is available, it verifies the signed manifest and bundle hash, checks app compatibility, and stages the update. Yapmod then offers a restart to apply it; active calls will disconnect, and an update that fails to start is rolled back.
- Fixed a Windows startup issue that could keep Yapmod's settings interface from loading correctly. Client startup now waits for the document root and head before installing its observers and styles, so the settings interface can integrate with Yapin's page.
- Windows now has minimize, maximize or restore, and close controls in Yapin's top bar. Follow-up fixes restore button clicks and authorize the window commands. The host top bar also serves as the macOS window drag area.
- Compact notification banners now appear in Yapin's top bar.

### Improvements and fixes

- Theme initialization waits until the document root exists, and injected styles wait until the page head is available. This makes startup styling more reliable.
- Fixed settings navigation freezes caused by repeated event listeners and a mutation observer loop. Added icons to Yapmod's settings sections.
- Updated Yapmod's Yapin integration for yapin.gg, including the supported bare and www addresses used to open the app and load the injected client.

### Development and infrastructure

- Daily and manually triggered nightly builds are now published as rolling prereleases for testing. Nightly builds may be unstable and do not have the stability guarantees of a stable release. They embed the client built from the same source revision.
- Moved the injected client into its own client/ directory and added versioned, signed client release tooling. The embedded client in this release is version 1.0.2; client and desktop app versions remain separate and compatible versions are still required.
- Unified the project checks, shared the app build workflow between stable and nightly packages, and improved portable and Windows MSI version handling. Removed unused Vite scaffolding and updated the website and desktop guides, including the AppImage limitation on some Wayland systems.

## [0.4.1] - 2026-10-22

### Fixed

- Theme mode changes now update the active styles without reloading the page.

## [0.4.0] - 2026-10-22

### Added

- System tray support lets yapmod keep running in the background when its window is closed, so desktop notifications continue while the window is hidden. This works on macOS, Windows, and most Linux desktop environments with tray indicators.
- Custom themes can be loaded directly into yapmod from dedicated folders containing a CSS file and a manifest.json file. The format and requirements are documented on the documentation site.

## [0.3.1] - 2026-10-21

### Fixed

- Desktop notifications now show up in the notification center of your system. The webview cannot post them by itself, so yapmod hands them over to the system.
- The number of unread messages now reaches the app icon, on the Dock, the taskbar and the panel.

### Added

- Added a Desktop notifications option and a Show the unread badge option to the yapmod section in the settings.
- Clicking a notification brings yapmod to the front and opens the message it was about.

### How it works

- Yapin keeps deciding when to notify you: muted channels and servers, Do Not Disturb, and a window that is in front are all respected.

## [0.3.0] - 2026-10-21

### Highlights

- Unread and mention badges now show up on servers and channels, with desktop notifications and notification sounds on Windows, macOS and Linux.
- Voice calls now work on macOS. The first time you join a call, allow microphone access and your mic is live.
- Yapmod now checks for updates and shows a notice when a newer version is available.

### Added

- Added a changelog in settings, so you can read the notes for every release from inside the app.
- Added a documentation site with full-text search for setup, troubleshooting, FAQ and developer docs.

### Fixed

- The previous settings panel no longer stays visible when you switch sections.
- Settings from older yapmod versions are migrated correctly, so your window options survive an update.
- The Linux app now uses the proper Tux icon.

### If your mic still does not work

- Enable yapmod in System Settings → Privacy & Security → Microphone, then relaunch.
- If yapmod is not listed there, run `tccutil reset Microphone io.ilyeshdz.yapmod` in Terminal and relaunch the app.

## [0.2.0] - 2026-10-20

### Highlights

- Added a Yapmod section to Yapin's settings, so desktop options live next to the rest of the app.
- Added an official landing page with direct download links for macOS, Windows, and Linux.
- External links now open in your default browser instead of inside the app.

### Added

- The native titlebar and start-maximized options can now be toggled from the settings page, and apply on the next launch.
- Settings are stored in your config file and can be written to from the injected page.
- The release notes modal now shows the version, release date, and changelog of every past release.

### Fixed

- Following a link to another site no longer opens a broken window inside the desktop client.

## [0.1.2] - 2026-10-20

### Fixed

- macOS builds are now ad-hoc signed, so the app opens without a damaged app warning.
- The login screen now opens when you are not signed in.
- Improved the README and release workflow.

### Added

- Release notes now appear after an update, so you can see what changed.
- The version you last ran is saved in your config file.

## [0.1.1] - 2026-10-20

### Added

- Added a reusable modal API for injected scripts.
- Added a welcome modal shown on the first launch.
- Added a config file with options for the native titlebar and starting maximized.

## [0.1.0] - 2026-10-20

### Highlights

- Yapin now runs in its own desktop window.
- Added a custom macOS titlebar overlay.
- Introduced the yapmod logo and desktop icons.
