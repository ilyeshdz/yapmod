---
title: Submit a theme
group: Publish
order: 1
area: themes
eyebrow: Publish
description: Publish a theme in the Yapmod community gallery.
---

Community themes are published through reviewed pull requests. The website
checks each theme and builds the catalog automatically; you do not need to
edit a catalog file.

## Before you submit

1. Create and test your theme using the format in [Structure and manifest](/yapmod/docs/themes/manifest).
2. Add a preview image and set its file name in the manifest's `preview` field.
   Community previews must be PNG, JPEG, WebP, GIF or SVG and smaller than 4 MB. The full set of limits is in [Structure and manifest](/yapmod/docs/themes/manifest#limits).
3. Keep the stylesheet under 1 MB. Include the theme's license and make sure
   you have permission to share the theme and preview.

## Open a pull request

1. Fork the [Yapmod repository](https://github.com/ilyeshdz/yapmod).
2. Add your theme at `community-themes/<id>/`. The folder name must match the
   `id` in `manifest.json`.
3. From the repository root, run `pnpm check:web` to check the website and
   validate the community theme catalog.
4. Open a pull request and complete the **Community theme** template with the
   theme name, id, author, license and preview image.

After review and merge, the website publishes the theme. Refresh the Community
gallery in Yapmod to find it.
