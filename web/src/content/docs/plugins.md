---
title: Plugins
group: Plugins
order: 1
eyebrow: Plugins
description: Import and manage trusted local or Community plugins.
---

Plugins extend the Yapper interface. Open **Settings → Yapmod → Plugins** to import a local package, inspect its installed files, enable or disable it, remove it, or browse the Community catalog. A gear button on a plugin card opens its settings in a modal; changes take effect when saved.

## Package format

Every plugin is a folder containing:

```text
my-plugin/
├── manifest.json
├── plugin.css
└── plugin.js       # optional
```

`manifest.json` describes the plugin, `plugin.css` changes the interface, and `plugin.js` may add behavior. Plugins can also declare simple on/off settings in the manifest.

## Trust

JavaScript plugins run directly inside the Yapper page. They are not sandboxed or isolated, and may access the page DOM, visible data, and functionality available from that page. Installing a JavaScript plugin means trusting its author.

CSS plugins can also change, hide, or imitate interface elements. Only install packages whose source you trust.

Yapmod validates the package files and shows a warning before installation. This validation makes imports predictable; it does not make a plugin safe.

See [Installing plugins](installing-plugins) to use a package and [Creating a plugin](creating-plugins) for the current authoring format.
