---
title: Installing plugins
group: Plugins
order: 2
eyebrow: Plugins
description: Import a local package or install a Community package.
---

Open **Settings → Yapmod → Plugins**.

- In **Installed**, choose **Import plugin** and select a folder containing `manifest.json`, `plugin.css`, and optionally `plugin.js`.
- In **Community**, choose **Install** for a listed package.
- Choose **View files** on an installed card to inspect its manifest, stylesheet, and optional script. Community packages are copied locally at installation and can be reviewed the same way.
- Use the gear button on a card to edit that plugin's settings in a modal, then choose **Save** to apply them.
- Read the warning before confirming. JavaScript packages run directly in the Yapper page and are not sandboxed.
- Use **Enable** and **Disable** to control an installed plugin. **Remove** deletes the package and its stored plugin data.

Community installation creates a local copy. There is no automatic update system: remove and reinstall a package manually to use a newer version.

Yapmod remembers consent only while the package version and its CSS/JavaScript content stay the same. A changed package requires confirmation again before automatic activation.
