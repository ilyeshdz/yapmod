# Contributing to yapmod

Thanks for interested in contributing! yapmod is a free, open-source desktop app for [Yapper](https://www.yapin.gg) — an independent community project not affiliated with Yapper.

## What is yapmod?

yapmod gives Yapper a real home on your computer: its own window, native integration with your operating system, and small builds that use the webview your system already ships instead of bundling a browser. It aims to be more than a website in a window, and in time to be a platform you can extend with themes and plugins.

## Tech stack

- **Backend**: [Rust](https://www.rust-lang.org/) with [Tauri](https://tauri.app/) for the desktop shell
- **Frontend**: [TypeScript](https://www.typescriptlang.org/) with [Solid.js](https://www.solidjs.com/)
- **Docs**: [Astro](https://astro.build/) static site in the `web/` directory

## How to help

- **Report a bug.** Open an [issue](https://github.com/ilyeshdz/yapmod/issues) with what happened, your operating system, and your yapmod version.
- **Suggest a feature.** Tell us what you'd like yapmod to do and why.
- **Write code.** Fork the repository, set it up, and open a pull request.
- **Improve the docs.** The documentation lives in `web/src/content/docs/` as Markdown files.

## Branches and release channels

- `main` is the stable branch and the default branch. Stable releases and
  hotfixes are published from it.
- `nightly` is the development branch. It builds the rolling nightly prerelease
  and the nightly client update feed.

Open pull requests against `nightly` unless the change is a stable hotfix. Never
merge unreviewed development work directly into `main`; nightly is promoted by
merging it into `main` deliberately. See [RELEASING.md](RELEASING.md) for the
full release and promotion workflow.

Local builds default to the stable update channel. Set
`YAPMOD_UPDATE_CHANNEL=nightly` when building to exercise the nightly update
path. A build never switches channels through an update.

## Getting started

1. Fork the repository and clone it locally.
2. Install dependencies: `pnpm install`
3. For development, run `pnpm tauri dev` to start the app with hot reloading.
4. Full setup instructions are in the [Run from source](https://ilyeshdz.github.io/yapmod/docs/run-from-source) docs.

## Before you submit

- For anything larger than a small fix, [open an issue](https://github.com/ilyeshdz/yapmod/issues) first so the direction is agreed on.
- Keep pull requests focused — one clear change is easier to review.
- Match the existing code style.
- Run the checks before pushing:

```bash
pnpm check
```

## Commit messages

Use conventional prefixes like `feat`, `fix`, `refactor`, `style`, `chore`, and `ci`, often with a scope:

```
fix(injection): hide the previous settings panel when switching sections
```

## Community

Join the discussion on the official Yapper server: [yapin.gg/invite/develop](https://www.yapin.gg/invite/develop)

For more detailed guidelines, see the [Contributing docs](https://ilyeshdz.github.io/yapmod/docs/contributing).
