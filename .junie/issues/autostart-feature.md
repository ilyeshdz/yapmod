# Feature: Autostart on Login

**Date:** 2026-11-08
**Status:** Proposed
**Type:** Feature request

## Summary

Add an "autostart" setting so yapmod can automatically launch when the user logs in. The setting should be toggleable from the desktop client's settings UI.

## Motivation

Users who keep yapmod running as a messaging client (with tray/menu-bar support) often want the app to start automatically on login, similar to Discord, Slack, or other chat applications. Currently, users must manually launch yapmod after each reboot.

## Proposed Implementation

### Plugin

Use the official Tauri autostart plugin: <https://tauri.app/plugin/autostart/>

- Rust crate: `tauri-plugin-autostart` (v2)
- JS bindings: `@tauri-apps/plugin-autostart`

### Files to Change

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-autostart = "2"` dependency |
| `src-tauri/src/main.rs` | Register the autostart plugin (with `MacosLauncher::LoginItem` on macOS) |
| `src-tauri/src/config.rs` | Add `"autostart"` to `DEFAULT_SETTINGS` (default: `false`) and `valid_setting` allowlist; add `manage_autostart()` helper called at startup and on setting change |
| `src-tauri/capabilities/default.json` | Add `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled` permissions |
| `client/features/settings/defaults.tsx` | Add "Start yapmod on login" toggle in the Window group (desktop only) |

### Behavior

- **On app startup:** read the `autostart` setting and call `enable()` or `disable()` on the autostart manager accordingly.
- **On setting change:** when the user toggles the setting, immediately enable or disable autostart (no restart required).
- **Default:** disabled (`false`).

### Platform Notes

- **macOS:** use `MacosLauncher::LoginItem` (Login Items) rather than the LaunchAgent approach, as it respects the system Settings privacy model.
- **Windows:** registry-based autostart under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Linux:** creates/updates `~/.config/autostart/` `.desktop` entry.

## Acceptance Criteria

- [ ] Toggling "Start yapmod on login" in settings immediately enables/disables autostart
- [ ] Autostart state persists across app restarts
- [ ] Works on macOS (Login Items), Windows (registry), and Linux (desktop entry)
- [ ] Setting validation rejects non-boolean values
- [ ] Existing tests pass; new tests cover the `autostart` setting
