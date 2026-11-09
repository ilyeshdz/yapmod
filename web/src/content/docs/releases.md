---
title: Releases and updates
description: How yapmod releases and updates work.
---

yapmod ships a single release channel, **Stable**. Releases are tested and receive bug fixes and security updates. There is no nightly or pre-release channel.

## Desktop app

Desktop builds are published on the [Releases page](https://github.com/ilyeshdz/yapmod/releases). Download the build for your platform and install it over the existing version; your settings and data are kept.

The app checks for updates in the background and offers to download and install a newer release when one is available.

## Client updates

The injected client is versioned separately from the desktop app and is published as a signed feed. When an update is available, yapmod stages it and prompts you to restart. You can defer the restart and the reminder persists.

Client updates can also be published without a new desktop release, so most fixes reach you without reinstalling the app.

## What gets updated how

| Update type | Delivery |
| --- | --- |
| Desktop app | GitHub Releases, with background update checks |
| Client (in-app) | Signed feed, applied on restart |
| Web extension | Browser store, or the loader's signed web feed |

Every client update is signed and verified before it runs. The app and the self-hosted web loader reject a manifest that is unsigned, expired, replayed, or incompatible with the installed version.
