---
title: Installing plugins
description: Import a local package or install a Community package.
---

Open **Settings → Yapmod → Plugins**. Community and local plugins share one gallery.

- Choose **Import plugin** and select a folder containing `manifest.json`, `plugin.css`, and optionally `plugin.js`.
- Search the gallery and filter it to installed or not-installed plugins. Each card has one switch: turn it on to install the package when needed and enable it, and turn it off to disable and remove it.
- Packages reviewed by the Yapmod owners show a small verified check next to their name; this is a review signal, not a security guarantee. See [Consent, verification and trust](/yapmod/plugins/security#consent-verification-and-trust).
- Use the gear button on an installed card to edit that plugin's settings in a modal, then choose **Save** to apply them.
- Some plugins add their own panel to the settings sidebar. Plugin panels appear under the **Plugins** group, or under a group named by the plugin.
- Importing a local package shows a warning about running trusted code. Locally imported packages ask for confirmation before their folder is deleted; community packages can be turned off in one click.
- Read the warning before confirming. JavaScript packages run directly in the Yapin page and are not sandboxed.

Community installation creates a local copy. There is no automatic update system: remove and reinstall a package manually to use a newer version.

Yapmod remembers consent only while the package version and its CSS/JavaScript content stay the same. A changed package requires confirmation again before automatic activation.
