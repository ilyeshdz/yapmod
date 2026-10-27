---
title: Release channels
group: Start
order: 3
eyebrow: Start here
description: Stable and nightly release channels explained.
---

yapmod ships through two independent release channels: **Stable** and **Nightly**. Each channel has its own update feed, so an installation on one channel never automatically switches to the other.

## Stable

The **Stable** channel is for normal use. Releases are tested and receive bug fixes and security updates. Stable builds download from the [Releases page](https://github.com/ilyeshdz/yapmod/releases).

Stable client updates are published automatically when a new GitHub release is created. Hotfixes can also be published independently without a new desktop app release.

## Nightly

The **Nightly** channel tracks ongoing development. Nightly builds may be unstable, can change frequently, and are replaced each day. Install the [nightly prerelease](https://github.com/ilyeshdz/yapmod/releases/tag/nightly) to try changes before they reach stable.

Nightly builds update from the nightly feed only. They are intended for testing and early feedback, not daily use.

## How channels stay separate

- Each channel has its own signed update manifest and bundle.
- The app validates the channel field in every update before applying it.
- A stable manifest cannot be applied to a nightly installation, and vice versa.
- Cache directories and release sequence counters are independent per channel.

## Switching channels

An installation stays on the channel it was installed from. To switch channels, download and install a build from the target channel. Your settings and data are preserved across channel switches.

## What gets updated how

| Update type | Stable | Nightly |
| --- | --- | --- |
| Desktop app | GitHub Releases | Rolling nightly release |
| Client (in-app) | Automatic on release | Automatic on nightly build |

When a client update is available, yapmod prompts you to restart and apply it. You can defer the restart and the reminder will persist.
