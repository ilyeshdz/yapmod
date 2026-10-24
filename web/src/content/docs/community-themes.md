---
title: Community themes
group: Themes
order: 3
eyebrow: Themes
description: Browse, install and contribute community themes.
---

## Browse and install

Open **Settings → Themes → Community** to browse themes published by the Yapmod community. Search by theme name, author, description or tag, then choose **Install** to add a theme to your local gallery. Once installed, pick it from **Installed** to apply it.

The app reads a static catalog from the Yapmod website. It does not need an account, and theme files are only downloaded when you choose to install one. Community themes use the same format as [local themes](creating-themes).

Themes are community-made CSS and can change or break the interface. Review the author and license shown with a theme, and remove it from the Installed gallery if you no longer want it.

## Submit a theme

Community themes are added through reviewed pull requests. This keeps the catalog static and lets maintainers check that each submission has a valid theme, a preview and a license before it appears in the app.

1. Create a theme folder using the format in [Creating a theme](creating-themes).
2. Add the folder under `community-themes/<id>/` in the [Yapmod repository](https://github.com/ilyeshdz/yapmod). The folder name must match the manifest `id`.
3. Include `manifest.json`, the stylesheet named by `css` (or `theme.css`), and a preview image named by `preview`. Community previews must be PNG, JPEG, WebP, GIF or SVG and smaller than 4 MB. Stylesheets must be smaller than 1 MB.
4. Open a pull request and fill in the **Community theme** template. Include the theme's license and confirm that you have permission to share its assets.

After a pull request is reviewed and merged, the website build validates the theme and publishes it to the static community catalog. The app will show it after the catalog is refreshed. You do not need to edit a catalog file yourself.

Themes contain CSS, not JavaScript. CSS can still affect the interface and request remote assets, so only install themes you trust.
