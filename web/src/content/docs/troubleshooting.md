---
title: Troubleshooting
group: Start
order: 3
eyebrow: Start here
description: Fixes for the problems people hit most often.
---

Most issues come down to the operating system getting in the way rather than yapmod itself. These are the fixes that help most often.

## macOS says the app is damaged or can't be opened

Builds are ad-hoc signed, which prevents the “damaged app” error, but they are not notarized. Right-click yapmod and choose **Open**, or allow it in **System Settings → Privacy & Security**. If the error keeps coming back, download the latest release again.

## The microphone doesn't work in voice calls

On macOS, allow yapmod under **System Settings → Privacy & Security → Microphone**. macOS remembers an earlier denial, so the prompt will not reappear on its own. If yapmod is not listed there, quit the app, relaunch it and try joining a call again. As a last resort you can reset the saved decision with `tccutil reset Microphone io.ilyeshdz.yapmod` and relaunch. On Windows, also check **Settings → Privacy & security → Microphone**.

## No notifications arrive

Check that *Desktop notifications* is on in the yapmod section of the settings. Yapper decides when to notify you, so a muted server or channel, Do Not Disturb, or a window that is in front will keep notifications away.

## The unread badge does not show

Check that *Show the unread badge* is on in the yapmod section of the settings. The badge also depends on what the operating system supports: macOS and Linux show a count on the Dock icon, Windows uses an overlay on the taskbar icon.

## The app keeps running after I close the window

yapmod keeps running in the menu bar on macOS or the system tray on Windows and Linux, so messages and notifications keep arriving. Click the icon to bring the window back, or choose **Quit Yapmod** from its menu. Turn off *Keep running in the menu bar* or *Keep running in the system tray* in the yapmod settings to make closing the window quit the app instead.

## The AppImage won't start

Make it executable with `chmod +x`. Some distributions also need FUSE installed to run AppImages.

### It crashes or shows a blank window on Fedora or another recent Wayland distribution

This is a known limitation of the AppImage build. On recent Fedora releases and some other modern Wayland-based distributions, the AppImage can load its bundled Wayland client libraries alongside the system EGL and Wayland stack. Those versions may be incompatible, which can prevent EGL from creating a display and make the app exit or show a blank window.

The practical fix would be to remove the bundled Wayland libraries while building the AppImage so it uses the system copies. That is not currently part of the release process. Use the `.rpm` package on Fedora or the `.deb` package on Debian and Ubuntu instead; those packages use the libraries provided by your distribution and are unaffected by this AppImage issue.

## Links open inside the app

Recent builds open external links in your browser. Update to the latest release if yours does not.

## A theme looks wrong or breaks the layout

Pick **Yapper's theme** in the theme gallery to get the usual look back, then remove the theme with the × on its card. A theme is plain CSS, so a broken rule can break the interface around it.

## I'm stuck on the login screen

Sign in with your Yapper account. If that fails on the Yapper website too, the problem is on Yapper's side, not yapmod's.

## Still stuck?

[Open an issue](https://github.com/ilyeshdz/yapmod/issues) with your operating system, your yapmod version and the steps to reproduce. That is usually enough to pin down the cause.
