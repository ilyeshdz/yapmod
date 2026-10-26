---
title: "Introducing yapmod"
description: "Why yapmod exists, how it started, and why I want to keep building it."
date: "2026-10-26"
author: "Kari"
---

Hi everyone!

I wanted to write this post because I think it's important to be transparent about what `yapmod` actually is, why I started working on it, how it’s built, and where I want to take it next. There’s a lot more to this project than just another app wrapper, and I think it’s worth pulling back the curtain a bit.

Let’s start from the beginning.

## It started with a simple problem

When I started working on `yapmod`, my goal was pretty straightforward: I wanted to use Yapin (formerly Yapper) on macOS without having to leave a browser tab open all day. There wasn't a dedicated desktop client for it, so I decided to build my own solution.

To be clear about the tech stack: `yapmod` isn't a purely native Swift app, nor is it just a web page in a basic browser frame. It’s built with **Tauri**, a cross-platform framework that uses web technologies inside a lightweight native window shell.

My goal was to give it a proper native feel on macOS with deep OS integration, desktop behaviors, and standalone performance. I wanted it to feel like a real desktop application rather than just a website stuck in a window.

Once I got the macOS version running smoothly, I published builds for Windows and Linux too. Predictably, some things broke along the way. But people from the community helped me spot issues I hadn't noticed myself, and we got them fixed. Today, `yapmod` runs across all three major desktop platforms, and I'm really grateful to everyone who helped test those early builds.

## From a desktop client to something more

If you've followed some of my previous open-source tinkering, you might know I've contributed a little bit on a personal level to projects like [Dorion](https://github.com/spikehd/dorion) and [Shelter](https://github.com/uwu/shelter). I wasn't a core maintainer or anyone famous on those projects at all, but tinkering with them gave me a real interest in client modifications and tweaking how applications behave.

At some point, I looked at what I was doing with `yapmod` and realized I was already modifying the original app to make desktop-grade features work properly. A good example of this is **notifications**: Yapin doesn't natively handle standalone desktop notifications out of the box, so I built a custom system to extract those notifications and route them properly to the OS.

That got me thinking: why stop at basic platform tweaks? Why not open the doors for full customization and let people build their own features?

That was the turning point for `yapmod`. I didn't want it to just be a way to run Yapin on desktop, I wanted it to become an extensible platform.

## Themes and building a real plugin system

Customization came first. I love tweaking my tools, so building a flexible theme system was a priority. It lets you completely restyle the UI without having to touch or recompile the main codebase.

Then came the bigger challenge: **the plugin system**.

The easiest route would have been letting plugins inject raw JavaScript directly into the app. While that gives developers full freedom, it also forces everyone to reinvent the wheel for basic tasks, leading to unstable code and broken setups.

Instead, I've been designing a dedicated developer API. I took charge of architecting how the injection system works from the ground up, giving plugin creators structured access to common tools, HTTP request interception, WebSockets, and shared UI elements like modals. The goal is to give developers flexibility while keeping the core app predictable and maintainable.

### Let's talk about AI (Because YES, I use it heavily)

I want to be completely honest here: **the vast majority of the code in `yapmod` was generated using AI.**

I'm not going to pretend I hand-wrote every single line from scratch, or that I've meticulously read through every single character of code generated. Claiming that would simply be untrue.

Using AI allowed me to move extremely fast, solve complex technical roadblocks, and bring this project from an idea to a working app in record time. It acted as an incredible accelerator for getting past tedious problems and shipping real solutions quickly.

However, **I am the author and architect of this project.** I designed how the injection mechanism works, I structured the overall architecture, and I guide how all the pieces fit together. I know how the system operates under the hood, even if AI helped write the implementation details.

My focus now is actively modifying, refining, and polishing that code to make `yapmod` as stable, safe, and robust as humanly possible.

## A quick word on security and rules

Plugin systems inherently come with risks. Giving scripts access to modify app behavior means users need to be cautious. `yapmod` warns users about untrusted plugins, and while we try to review community submissions, no process is 100% bulletproof. Inspecting source code and trusting the authors you install from remains essential.

As for the broader future of client mods: I know platforms like Yapin have valid concerns about security, abuse, and third-party tools. I deeply respect Antic's decisions as the creator of Yapin, it's his platform, and he sets the rules. My hope is that projects like `yapmod` can continue to exist alongside official platforms under clear, reasonable guidelines.

## There's only one person behind this

If there's one thing to keep in mind, it's that **I'm the sole maintainer working on `yapmod`.**

I handle the features, bug fixes, releases, cross-platform issues, and documentation all by myself (with a lot of help from AI to keep up the pace!).

I'm also a student. Right now, I'm on holiday, which is why updates are coming out quickly. But once school starts again, my free time will naturally decrease, and development will slow down.

Slower updates won't mean I've abandoned the project, it just means real life takes priority. I'd rather be transparent about my schedule than make promises I can't keep.

## How you can help

Even though I'm building this solo, I don't want `yapmod` to exist in a vacuum.

Whether you're building a plugin, creating a theme, testing builds, or simply opening a well-detailed bug report on GitHub, you're directly helping the project. Every piece of feedback helps save me time and makes the app better for everyone.

I'm building `yapmod` because I use it every day and genuinely enjoy working on it. If you want to dive in, check out the source code or contribute, head over to [GitHub](https://github.com/ilyeshdz/yapmod).

## What's next?

The plugin API remains my top priority. Beyond that, I want to keep improving cross-platform stability, refining the Tauri-based desktop experience, and making customization easier for everyone.

Thank you to everyone who has tried `yapmod`, reported a bug, or shared feedback so far. I'm excited to see where we can take this project next!