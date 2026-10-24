---
title: Creating a theme
group: Themes
order: 2
eyebrow: Themes
description: The theme format and a complete example.
---

A local theme is a folder with a `manifest.json` and a stylesheet. You can also install themes from the community catalog; those files are downloaded from the Yapmod website when you choose **Install**.

```
midnight-blurple/
  manifest.json
  theme.css
```

## The manifest

```json
{
  "id": "midnight-blurple",
  "name": "Midnight Blurple",
  "version": "1.0.0",
  "author": "your name",
  "description": "Cool blues on a deep navy base.",
  "license": "MIT",
  "mode": "dark",
  "tags": ["dark", "blue"],
  "api": 1
}
```

| Field | Required | What it does |
| --- | --- | --- |
| `id` | yes | The identifier of the theme. It becomes the name of the folder inside the themes folder, so it may only use letters, digits, `-`, `_` and `.`, and may not start with a dot. |
| `name` | yes | The name that is shown in the gallery. |
| `version` | no | The version of the theme itself. |
| `author` | no | Who made it. |
| `description` | no | A line about it. |
| `license` | no | The license of the theme. |
| `mode` | no | `dark`, `light` or `both`. A theme that says `both` follows the mode setting in the app. Anything else is treated as `dark`. |
| `tags` | no | Words that describe the theme. The Community gallery includes them in search. |
| `api` | no | The theme format the theme was written against. The current version is `1`. |
| `preview` | no | The name of a preview image in the folder, such as `preview.png`. Without it, the gallery draws a small picture of the app from the tokens of the theme. |
| `css` | no | The stylesheet of the theme. Defaults to `theme.css`. It has to be a file inside the theme folder. |

A theme that asks for a newer `api` than the app understands is refused, instead of being applied halfway.

## The stylesheet

The stylesheet is ordinary CSS and loads after the app styles, so it can change more than colours.

There are two attributes on the root element that a theme can use:

| Attribute | What it holds |
| --- | --- |
| `data-yapmod-theme` | The id of the theme that is applied. |
| `data-yapmod-mode` | `dark` or `light`, the mode the theme is shown in. |

### The tokens

The simplest way to write a theme is with tokens. A theme that supports both modes defines them twice.

```css
:root[data-yapmod-mode="dark"] {
  --ym-bg-main: #15161c;
  --ym-bg-elev: #1c1d25;
  --ym-accent: #5865f2;
  --ym-text: #ececf1;
  --ym-radius: 12px;
}

:root[data-yapmod-mode="light"] {
  --ym-bg-main: #ffffff;
  --ym-bg-elev: #f2f3f5;
  --ym-accent: #5865f2;
  --ym-text: #1d1f23;
  --ym-radius: 12px;
}
```

A missing token keeps its default value, so define only what you need. The full list is on the [Themes](themes) page.

For example, `--ym-bg-main` changes the chat, settings and dialog backgrounds together.

### Plain CSS

Use regular CSS for anything tokens do not cover, such as a font or a component-specific rule.

```css
:root[data-yapmod-mode="dark"] {
  --font: "Inter", ui-sans-serif, system-ui, sans-serif;
}

.message {
  border-radius: 4px;
}
```

A few things to keep in mind:

- The stylesheet runs in the page, so relative `url()` paths point to the web app, not your theme folder. Use a full address or a `data:` URI for images and fonts.
- The topbar doubles as the macOS window drag region, and the scroll lock of a dialog is functional. Leave them alone.
- A theme is plain CSS and can break the layout. Pick **Yapper's theme** in the gallery to restore the usual look.

## A complete example

```css
:root[data-yapmod-mode="dark"] {
  --ym-bg-rail: #101116;
  --ym-bg-side: #16171e;
  --ym-bg-main: #1b1c23;
  --ym-bg-elev: #22232c;
  --ym-bg-hover: #292a34;
  --ym-bg-active: #33343f;
  --ym-text: #ececf1;
  --ym-text-muted: #9c9daa;
  --ym-border: #ffffff14;
  --ym-accent: #5865f2;
  --ym-accent-soft: #5865f233;
  --ym-on-accent: #ffffff;
  --ym-radius: 10px;
}

:root[data-yapmod-mode="light"] {
  --ym-bg-rail: #e3e5e8;
  --ym-bg-side: #f2f3f5;
  --ym-bg-main: #ffffff;
  --ym-bg-elev: #ebedef;
  --ym-text: #1d1f23;
  --ym-text-muted: #5b5d66;
  --ym-border: #00000017;
  --ym-accent: #5865f2;
  --ym-on-accent: #ffffff;
  --ym-radius: 10px;
}
```

## Trying it out

1. Create a folder with a `manifest.json` and a `theme.css`.
2. Open **Settings → Themes** in yapmod.
3. Press **Import theme** and pick your folder, or press **Open folder** and copy it into the themes folder.
4. Press **Refresh**, then click your theme to use it. To share it in the community gallery, follow [Submit a theme](community-themes#submit-a-theme).

## Rules

- The manifest has to be valid JSON, and it needs an `id` and a `name`.
- The id ends up in a folder name, so it may only use letters, digits, `-`, `_` and `.`, and may not start with a dot.
- The stylesheet has to be inside the theme folder, and cannot point outside of it.
- Importing a theme copies the whole folder into the themes folder, under its id. A theme that is already installed under the same id is replaced.
- A theme is applied as it is. There is no sandbox, and no way to run code from a theme.
