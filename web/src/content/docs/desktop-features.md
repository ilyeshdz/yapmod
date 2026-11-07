---
title: Desktop features
group: Start
order: 3
eyebrow: Start here
description: Notifications, unread badges, window behavior and updates.
---

Open Yapper's **Settings → Yapmod** section to configure the desktop app. Notifications, the unread badge, keep-running and automatic update checks are on by default. The window options are off by default.

## Notifications and unread badge

- **Desktop notifications** sends system notifications for messages when the yapmod window is in the background. Yapper still decides which messages should notify you, and your operating system may ask you to allow notifications.
- **Show the unread badge** puts the unread count on the app icon. macOS and Linux show it on the Dock or launcher icon; Windows draws it over the taskbar icon. The operating system controls how the badge looks.

## Keep running when the window closes

**Keep running in the menu bar** on macOS, or **Keep running in the system tray** on Windows and Linux, keeps yapmod open when you close its window. Use the menu bar or tray icon to bring the window back, and choose **Quit Yapmod** there to exit. Turn this option off if closing the window should quit the app.

## Window options

- **Start maximized** opens the window maximized. The change takes effect after a restart.
- **Use native titlebar** appears on macOS. It replaces yapmod's overlaid titlebar with the standard macOS titlebar, and takes effect after a restart.

## Window transparency

**Window transparency** applies the operating system's native translucent window effect: vibrancy on macOS, and Mica with Acrylic or Blur fallbacks on Windows. The change applies immediately, and yapmod remembers it for the next launch.

Transparency makes the window background see-through, not every panel. Enable **Force theme transparency** to make the active theme's panels translucent too, so the desktop shows through. Dialogs, menus and other elevated surfaces stay opaque so text remains readable.

The **Transparency level** slider controls how much of the theme colour remains; lower values are more transparent.

Window transparency is not available on Linux, where the effect depends on the desktop compositor.

## Updates

**Check for updates automatically** looks for yapmod app and client updates when the app starts and shows an update prompt. The desktop app itself is installed from the [Releases page](https://github.com/ilyeshdz/yapmod/releases); signed client updates can be downloaded in the background and applied after restarting yapmod. Turn this option off to stop automatic checks and prompts.

The Yapmod settings section also shows the installed desktop and client versions. Open **Changelog** in the same settings group to browse release notes.

## Report a bug

Open **Settings → Yapmod** and choose **Report a bug**. Describe what happened, then copy the report or open a prefilled GitHub issue. The report includes the desktop and client versions, your platform, language, screen size, active theme and enabled plugins. It does not include your messages or account information.

## Themes

Manage installed themes in **Settings → Themes**. See [Using themes](/yapmod/docs/using-themes) for installing and removing them, or the [Themes developer documentation](/yapmod/docs/themes) for the theme format.
