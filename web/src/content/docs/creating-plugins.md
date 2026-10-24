---
title: Creating a plugin
group: Plugins
order: 3
eyebrow: Plugins
description: The current minimal plugin package format.
---

Create a folder containing `manifest.json`, `plugin.css`, and optionally `plugin.js`:

```text
my-plugin/
├── manifest.json
├── plugin.css
└── plugin.js       # optional
```

Use this minimal manifest:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your name",
  "description": "What this plugin changes.",
  "api": 1,
  "stylesheet": "plugin.css",
  "script": "plugin.js"
}
```

Remove the `script` line when there is no `plugin.js`. `id`, `name`, and `api: 1` are required. IDs use letters, digits, `_`, and `-`, are at most 24 characters, and start with a letter or digit.

`plugin.css` is applied while the plugin is enabled. It cannot use `@import`, `url()`, CSS escapes, or external resources.

When present, `plugin.js` must return an object with `activate(api)`:

```js
return {
  activate(api) {
    document.documentElement.dataset.myPlugin = "enabled";
    api.banner("My Plugin is enabled.");

    return () => {
      delete document.documentElement.dataset.myPlugin;
    };
  },
};
```

`activate` and its cleanup may be asynchronous. The API provides namespaced storage, manifest-declared setting reads/listeners, extra validated styles, and banners. Cleanup must remove the listeners, timers, nodes, and DOM changes created by the plugin.

Declare user-facing options in the manifest's `settings` array. Yapmod shows these controls in a settings modal on the plugin card; the user's changes are applied when they choose **Save**.

JavaScript plugins are trusted page code, not sandboxed extensions. Test locally with **Settings → Yapmod → Plugins → Import plugin** and only distribute code you expect users to trust.
