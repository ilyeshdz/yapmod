---
title: Contributing
group: Contributing
order: 2
eyebrow: Contributing
description: How to help build and improve yapmod.
---

yapmod is made by the people who use it. Whether you write code, report what breaks, fix documentation or just have a good idea, contributions are welcome.

## Ways to help

- **Report a bug.** Open an [issue](https://github.com/ilyeshdz/yapmod/issues) with what happened, your operating system and your yapmod version.
- **Suggest a feature.** Tell us what you would like yapmod to do and why.
- **Write code.** Fork the repository, set it up with [Run from source](run-from-source), and open a pull request.
- **Improve the docs.** These pages live in `web/src/content/docs`, one Markdown file per page. Add a file with the frontmatter it needs, and it appears in the sidebar.

## Working on a change

1. For anything larger than a small fix, [open an issue](https://github.com/ilyeshdz/yapmod/issues) first so the direction is agreed on.
2. Fork the repository and set it up with [Run from source](run-from-source).
3. Keep your pull request focused. One clear change is easier to review than several at once.
4. Match the style of the code around you, and run the checks below before you push.

## The checks

| Check | Command |
| --- | --- |
| Types of the injected client | `pnpm client:check` |
| Types generated from Rust | `pnpm types:generate` |
| Formatting and lints of the Rust code | `cargo fmt --check` and `cargo clippy` |
| The Rust unit tests | `cargo test` |

## A note on accuracy

Because yapmod makes deliberate claims about what it does and does not do, the documentation matters as much as the code. If you change how something behaves, update the page that describes it, and keep the descriptions of the settings and the commands in sync with the code.

## Commit messages

The history uses conventional prefixes such as `feat`, `fix`, `refactor`, `style`, `chore` and `ci`, often with a scope:

```text
fix(injection): hide the previous settings panel when switching sections
```

## Community

Ask questions and follow along on the official Yapper server: [yapper.website/invite/develop](https://yapper.website/invite/develop).
