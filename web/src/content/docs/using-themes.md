---
title: Using themes
group: Start
order: 5
eyebrow: Start here
description: Install, apply and remove themes in yapmod.
---

A theme is a folder containing a manifest and a stylesheet. It can change Yapper, the yapmod settings and dialogs. System notifications keep their normal system look.

Looking for the authoring format? Start with the [Themes developer documentation](/yapmod/docs/themes).

## Where themes live

Installed themes live here:

| Platform | Themes folder |
| --- | --- |
| macOS | `~/Library/Application Support/io.ilyeshdz.yapmod/themes` |
| Windows | `%APPDATA%\io.ilyeshdz.yapmod\themes` |
| Linux | `~/.config/io.ilyeshdz.yapmod/themes` |

Use **Open folder** in the theme settings to open it in your file manager.

## Installing a theme

A theme is a folder. You can install it in either of these ways.

- **Import it.** Press **Import theme** in the settings and pick the folder of the theme in the file dialog. The folder is copied into the themes folder for you. If a theme with the same id is already installed, remove it first.
- **Put it in the themes folder.** Copy the folder of the theme into the themes folder, then press **Refresh**. The theme shows up in the gallery right away.

Themes you import yourself are loaded from this folder. You can also browse and install reviewed community themes from the **Community** tab; see [Community themes](/yapmod/docs/community-themes).

## Using a theme

**Settings → Themes** holds the gallery.

- **Pick one** to apply it. The change is immediate, and it is remembered.
- **Remove one** with the × on its card to delete it from your themes folder.

Use **Import theme**, **Refresh** and **Open folder** to manage the gallery. **Mode** lets a theme with light and dark variants follow your system or stay on one mode.

![The Themes settings, showing the theme gallery and controls](../../assets/docs/themes-gallery.png)

A theme is plain CSS. If one looks wrong, pick **Yapper's theme** in the gallery to return to the normal look, then remove the theme with the × on its card.

[Creating a theme](/yapmod/docs/themes/getting-started) covers the format, tokens and a complete example.
