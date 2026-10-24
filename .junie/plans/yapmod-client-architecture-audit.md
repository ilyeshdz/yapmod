---
sessionId: session-261024-145009-1jwl
---

# Executive Summary

## Executive Summary

Yapmod is a **Tauri desktop client** that injects JavaScript into an existing Yapper web application. The client runs as two IIFE bundles (`preinject.ts` and `postinject.ts`) built with esbuild, with zero framework dependencies. It provides themes, plugins, settings, modals, banners, notifications, updates, and desktop bridge integration.

### Current State

The codebase (~5,500 lines across 34 files) is **well-written for its constraints**. The architecture is intentional: a flat `shared/` directory with install-* functions that register APIs on a global `__yapmod` object. CSS is embedded as template literals in TypeScript and injected at runtime via `upsertStyle()`.

### Key Findings

1. **The architecture is sound but the DOM construction is verbose.** The `createElement()` helper in `ui.ts` is a solid abstraction, but complex components (modal: 698 lines, settings: 738 lines, plugins: 804 lines, dropdown: 498 lines) involve deep nesting of `createElement()` calls that are hard to scan visually.

2. **CSS is split between three locations** with no clear ownership model: `assets/css/minimum.css` (349 lines, bundled by esbuild), inline template literals in `*.styles.ts` files (picker.styles.ts: 251 lines, plugins.styles.ts: 214 lines), and CSS embedded directly in TypeScript modules (modal.ts: ~100 lines of CSS in a template string).

3. **SolidJS is a strong fit** for this codebase. The client already has a component-oriented architecture (modals, dropdowns, settings items, theme cards, plugin cards) that maps naturally to JSX components. SolidJS's fine-grained reactivity would simplify the manual state synchronization scattered across modules.

4. **No significant dead code or overengineering found.** The codebase is lean. The main problems are developer experience (verbose DOM construction) and CSS organization, not architectural rot.

### Recommendation

**Adopt SolidJS with TypeScript and JSX.** The migration cost is moderate (~2-3 weeks), and the long-term benefits for developer experience, component composition, and maintainability are substantial. The codebase is already component-oriented; SolidJS formalizes that pattern while adding reactivity, lifecycle management, and a declarative syntax.

### What Should Stay

- The `install-*` API registration pattern (it works well for the injection model)
- The `createElement()` helper (replaced by JSX, but the concept is sound)
- The store, Tauri bridge, and scope abstractions (these are clean)
- The theme token system (well-designed)
- The plugin security model (consent, validation, sandboxing)

# Current Architecture

## Current Architecture

### Injection Model

The client operates as **injected code** inside a Yapper web application running in a Tauri webview. Two bundles are produced:

- **`preinject.ts`** — runs early, before the page loads. Initializes the global `__yapmod` object, installs APIs (modal, plugins, banner, settings, store, theme, desktop bridge, notifications, external links), and applies the theme before the first frame paints.
- **`postinject.ts`** — runs after the page loads. Applies OS-specific styles, installs topbar window controls (macOS drag region, Windows custom buttons), schedules update checks, and exposes `applyCss()` for runtime style injection.

Both bundles are compiled to IIFE format by esbuild and placed in `src-tauri/gen/injection/`.

### Module Structure

```
client/
  preinject.ts          # Entry: installs all APIs
  postinject.ts         # Entry: UI integration, updates
  shared/
    scope.ts            # Global __yapmod object access
    types.ts            # TypeScript interfaces (328 lines)
    ui.ts               # DOM helpers: createElement, upsertStyle, SVG icons
    modal.ts            # Modal dialog system (698 lines)
    settings.ts         # Settings panel integration (738 lines)
    items.ts            # Settings item renderers (218 lines)
    dropdown.ts         # Dropdown component (498 lines)
    store.ts            # Key-value store with debounced persistence (128 lines)
    defaults.ts         # Default settings sections (268 lines)
    plugins.ts          # Plugin lifecycle & UI (804 lines)
    plugins.styles.ts   # Plugin UI CSS (214 lines)
    banner.ts           # Banner notifications (169 lines)
    desktop.ts          # Desktop bridge (57 lines)
    notify.ts           # System notifications (171 lines)
    links.ts            # External link handling (190 lines)
    update.ts           # Update checks & UI (157 lines)
    release.ts          # Changelog rendering (173 lines)
    tauri.ts            # Tauri IPC bridge (32 lines)
    theme/
      engine.ts         # Theme application & watchers (450 lines)
      picker.ts         # Theme gallery UI (502 lines)
      picker.styles.ts  # Theme UI CSS (251 lines)
      picker-preview.ts # Theme preview rendering (188 lines)
      tokens.ts         # Color token system (274 lines)
      types.ts          # Theme types (27 lines)
  generated/
    types.ts            # Auto-generated from Rust (99 lines)
  assets/
    css/minimum.css     # Base styles (349 lines)
    icon.svg
  build.mjs             # esbuild configuration
  tsconfig.json         # TypeScript config
```

### Data Flow

```
preinject.ts
  → installModalApi()        → registers modal API on __yapmod
  → installPluginApi()       → registers plugins API
  → installBannerApi()       → registers banner API
  → installStore()           → key-value store with IPC persistence
  → installSettingsApi()     → settings panel system
  → initializePluginManager() → loads installed plugins
  → installPluginSettings()  → registers plugin settings section
  → installThemeEngine()     → applies theme, watches system/store
  → installDefaultSettings() → registers yapmod settings section
  → installThemeSettings()   → registers theme picker section
  → installDesktopBridge()   → exposes yapperDesktop API
  → installNotificationApi() → system notification bridge
  → installExternalLinks()   → patches window.open for external URLs

postinject.ts
  → applyOsAttribute()       → sets data-yapmod-os on <html>
  → installTopbarWindowControls() → MutationObserver for topbar
  → remountThemeStyles()     → moves theme stylesheet to end of <head>
  → scheduleUpdatePrompts()  → checks for app and client updates
```

### State Management

- **Store** (`store.ts`): In-memory Map with debounced IPC writes to the backend. Supports `onChange()` listeners per key. Reads from pre-shipped config snapshot.
- **Theme state** (`theme/engine.ts`): Tracks active theme, watches system color scheme, store changes, and host app's `data-theme` attribute via MutationObserver.
- **Plugin state** (`plugins.ts`): Registry map tracking enabled/disabled state, cleanup functions, and diagnostics per plugin.
- **Settings state** (`settings.ts`): Registry of sections with nav buttons, panels, and teardown functions.

### CSS Architecture

CSS lives in three places:
1. **`assets/css/minimum.css`** — bundled by esbuild, contains base styles for settings panels, changelog, banners, update modal, and window controls.
2. **`*.styles.ts` files** — template literal exports (picker.styles.ts, plugins.styles.ts) injected at runtime via `ensureStyle()`.
3. **Inline in TypeScript** — modal.ts embeds ~100 lines of CSS in a `MODAL_CSS` constant.

All runtime CSS uses the `upsertStyle()` helper, which creates/updates `<style>` elements in `<head>` by ID.

### Build System

- **esbuild** bundles preinject.ts and postinject.ts into IIFE format.
- **TypeScript** provides type-checking only (`noEmit: true`), no transpilation.
- **No JSX support** currently.
- **No CSS bundling** — CSS is either bundled as text (minimum.css via esbuild loader) or embedded as template literals.

# Findings & Evidence

## Findings & Evidence

### 1. Verbose DOM Construction (High Impact)

**Files:** `modal.ts`, `settings.ts`, `plugins.ts`, `dropdown.ts`, `picker.ts`, `items.ts`, `banner.ts`, `update.ts`, `defaults.ts`, `release.ts`

Every UI component is built with nested `createElement()` calls. Complex components require 10-20 levels of nesting, making the structure hard to scan:

**Example from `modal.ts` (constructor):**
```typescript
this.element = createElement("div", {
  className: "overlay yapmod-modal-overlay",
  dataset: { yapmodModal: this.id },
  props: { hidden: true },
});
this.dialog = createElement("div", {
  className: ["modal", "yapmod-modal", `yapmod-modal--${options.size ?? "md"}`, options.className ?? ""]
    .filter(Boolean).join(" "),
  dataset: { yapmodModalDialog: "" },
  attrs: { role: "dialog", "aria-modal": "true" },
  props: { tabIndex: -1 },
});
```

**Example from `plugins.ts` (createCard):**
```typescript
return createElement("article", {
  className: ["yapmod-plugin-card", plugin.enabled ? "yapmod-plugin-active" : ""].filter(Boolean).join(" "),
  children: [
    createElement("div", {
      className: "yapmod-plugin-card-body",
      children: [
        createElement("div", {
          className: "yapmod-plugin-card-title-row",
          children: [
            createElement("h3", { className: "yapmod-plugin-card-name", text: manifest.name }),
            createElement("span", { className: plugin.enabled ? "yapmod-plugin-state yapmod-plugin-state-active" : "yapmod-plugin-state", text: plugin.enabled ? "Enabled" : "Disabled" }),
          ],
        }),
        // ... more nesting
      ],
    }),
  ],
});
```

**Impact:** Components are hard to read, modify, and review. Adding a new UI element requires understanding the `ElementOptions` type and its `className`/`text`/`html`/`attrs`/`dataset`/`props`/`on`/`children` structure.

### 2. CSS Scattered Across Three Locations (Medium Impact)

**Files:** `assets/css/minimum.css`, `modal.ts` (MODAL_CSS), `picker.styles.ts`, `plugins.styles.ts`

- `minimum.css` (349 lines) is bundled by esbuild and contains styles for settings panels, changelog, banners, update modal, and window controls.
- `modal.ts` embeds ~100 lines of CSS in a `MODAL_CSS` constant, injected via `ensureStyle()`.
- `picker.styles.ts` (251 lines) and `plugins.styles.ts` (214 lines) export CSS as template literals.

**Problems:**
- No single source of truth for where a given component's styles live.
- CSS in TypeScript files cannot be linted, extracted, or analyzed by CSS tools.
- No CSS module boundaries — all styles are global.
- Theme tokens (`--ym-*`) are used inconsistently: some selectors use them with fallbacks (`var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)))`), others don't.

### 3. Repeated SVG Icon Construction (Low Impact)

**Files:** `ui.ts`, `settings.ts`, `plugins.ts`, `dropdown.ts`

SVG icons are created manually with `document.createElementNS()` and repeated attribute setting. The `createSvgIcon()` and `createSvgCheck()` helpers in `ui.ts` cover the common case, but `settings.ts` and `plugins.ts` each have their own `createSectionIcon()` and `createPluginIcon()` functions with nearly identical logic.

### 4. Repeated Gallery/Toolbar Patterns (Medium Impact)

**Files:** `picker.ts`, `plugins.ts`

The theme picker and plugin gallery share nearly identical patterns:
- Tab switching (Installed / Community)
- Search input with filtering
- Grid of cards
- Toolbar with action buttons
- Status message area
- `renderGallery()` / `renderCommunity()` functions
- `loadCommunity()` async loading

These two components (~500 lines each) could share a generic gallery abstraction.

### 5. Large Monolithic Components (Medium Impact)

**Files:** `plugins.ts` (804 lines), `settings.ts` (738 lines), `modal.ts` (698 lines), `dropdown.ts` (498 lines), `picker.ts` (502 lines)

These files combine multiple concerns:
- **plugins.ts**: Plugin lifecycle management + consent UI + card rendering + gallery UI + settings modal + source viewer
- **settings.ts**: Settings API + nav integration + panel management + React DOM observation + section rendering
- **modal.ts**: Modal API + DOM construction + focus management + keyboard handling + scroll locking + ARIA

### 6. No Significant Dead Code Found

The codebase is lean. Every function and module is reachable from the execution path. No unused imports, abandoned implementations, or unreachable branches were identified.

### 7. No Overengineering

The abstractions are proportional to the problem:
- `createElement()` is a thin wrapper, not a framework.
- The store is a simple Map with debounced writes.
- The theme engine is straightforward: apply CSS, watch for changes.
- The plugin system has appropriate security (consent, validation, content hashing).

### 8. Tight Coupling to Yapper's DOM (Inherent Constraint)

**Files:** `settings.ts`, `banner.ts`, `postinject.ts`

The client depends on Yapper's DOM structure (`.settings`, `.settings-nav`, `.settings-main`, `.topbar`, `.modal`). This is an inherent constraint of the injection model, not a design flaw. The code handles this carefully with MutationObservers and defensive selectors.

### 9. Event Listener Management (Minor)

**Files:** `dropdown.ts`, `settings.ts`, `modal.ts`

Event listeners are managed manually with add/remove patterns. The `safeTeardown()` helper helps, but there's no unified lifecycle system. This is manageable but could be cleaner with a framework's lifecycle hooks.

### 10. TypeScript Coverage Is Good

The codebase has comprehensive type definitions (`types.ts`, generated types, module-specific types). No `any` types or untyped code were found. The `ElementOptions` generic type provides good type safety for `createElement()`.

# Component Architecture & JSX Evaluation

## Component Architecture & JSX Evaluation

### Current Approach: createElement() Helper

The `createElement()` function in `ui.ts` is a solid, type-safe DOM builder. It supports:
- `className`, `text`, `html` for content
- `attrs` for HTML attributes
- `dataset` for data attributes
- `props` for DOM properties (type-safe via `HTMLElementTagNameMap`)
- `on` for event listeners
- `children` for child nodes

**Strengths:**
- Zero dependencies
- Type-safe property assignment
- Works with direct DOM rendering
- No virtual DOM overhead

**Limitations:**
- Deeply nested calls are hard to read
- No declarative composition
- No reactive updates (manual DOM manipulation required)
- No lifecycle management
- Conditional rendering requires JavaScript branching
- List rendering requires `.map()` + `.append()`

### JSX as a Solution

JSX would transform:
```typescript
createElement("div", {
  className: "card",
  children: [
    createElement("h3", { text: name }),
    createElement("p", { text: description }),
  ],
});
```

Into:
```tsx
<div class="card">
  <h3>{name}</h3>
  <p>{description}</p>
</div>
```

**Benefits:**
- Visual structure matches DOM structure
- Easier to scan, modify, and review
- Natural composition with components
- Conditional rendering: `{condition && <Child />}`
- List rendering: `{items.map(item => <Card key={item.id} {...item} />)}`

**Requirements:**
- JSX runtime (library)
- JSX transform (compiler)
- Type definitions (`@types/react` or framework-specific)
- Build configuration updates

### Approach Comparison

#### Option 1: Improve createElement() Abstractions

Add higher-level helpers (e.g., `h()`, `fragment()`, component factories) to reduce nesting.

**Pros:** Zero new dependencies, minimal migration cost.
**Cons:** Still imperative, still hard to read for complex structures, doesn't solve reactivity.

#### Option 2: Custom JSX Runtime (Preact-style)

Implement a minimal `h()` + `hydrate()` runtime that compiles JSX to direct DOM calls.

**Pros:** JSX syntax without a full framework, small bundle.
**Cons:** Reinventing the wheel, no reactivity, no lifecycle, maintenance burden.

#### Option 3: SolidJS (Recommended)

Adopt SolidJS with its JSX runtime and fine-grained reactivity.

**Pros:**
- JSX syntax with direct DOM rendering (no virtual DOM)
- Fine-grained reactivity (signals, memos, effects)
- Component lifecycle (onMount, onCleanup)
- Small runtime (~7KB gzipped)
- TypeScript-first
- Compiles to highly optimized code
- Familiar JSX syntax

**Cons:**
- New dependency
- Build configuration changes
- Migration effort for existing components
- Learning curve for the team

#### Option 4: Preact

Lightweight React-compatible framework.

**Pros:** Small (~3KB), familiar API, large ecosystem.
**Cons:** Virtual DOM (less efficient than SolidJS), React compatibility is a liability for a non-React project, larger ecosystem means more temptation to over-engineer.

### Recommendation: SolidJS

SolidJS is the best fit because:
1. **Direct DOM rendering** — no virtual DOM, matching the current architecture's philosophy
2. **Fine-grained reactivity** — eliminates manual state synchronization
3. **Small footprint** — ~7KB gzipped runtime, suitable for an injected client
4. **TypeScript-first** — excellent type inference for JSX
5. **Component model** — formalizes the existing component-oriented architecture
6. **Incremental adoption** — can coexist with direct DOM code during migration

### Before/After: Modal Content Construction

**Before (modal.ts):**
```typescript
this.element = createElement("div", {
  className: "overlay yapmod-modal-overlay",
  dataset: { yapmodModal: this.id },
  props: { hidden: true },
});
this.dialog = createElement("div", {
  className: ["modal", "yapmod-modal", `yapmod-modal--${options.size ?? "md"}`, options.className ?? ""]
    .filter(Boolean).join(" "),
  dataset: { yapmodModalDialog: "" },
  attrs: { role: "dialog", "aria-modal": "true" },
  props: { tabIndex: -1 },
});
```

**After (SolidJS):**
```tsx
<div class="overlay yapmod-modal-overlay" data-yapmod-modal={id} hidden={true}>
  <div
    class={`modal yapmod-modal yapmod-modal--${size ?? "md"} ${className ?? ""}`.trim()}
    data-yapmod-modal-dialog=""
    role="dialog"
    aria-modal="true"
    tabIndex={-1}
  >
    {/* children */}
  </div>
</div>
```

### Before/After: Plugin Card

**Before (plugins.ts):**
```typescript
return createElement("article", {
  className: ["yapmod-plugin-card", plugin.enabled ? "yapmod-plugin-active" : ""].filter(Boolean).join(" "),
  children: [
    createElement("div", {
      className: "yapmod-plugin-card-body",
      children: [
        createElement("div", {
          className: "yapmod-plugin-card-title-row",
          children: [
            createElement("h3", { className: "yapmod-plugin-card-name", text: manifest.name }),
            createElement("span", {
              className: plugin.enabled ? "yapmod-plugin-state yapmod-plugin-state-active" : "yapmod-plugin-state",
              text: plugin.enabled ? "Enabled" : "Disabled",
            }),
          ],
        }),
        createElement("p", { className: "yapmod-plugin-card-meta", text: meta }),
        createElement("p", { className: "yapmod-plugin-card-description", text: manifest.description ?? "No description." }),
      ],
    }),
    // ... footer
  ],
});
```

**After (SolidJS):**
```tsx
<article class={`yapmod-plugin-card ${enabled ? "yapmod-plugin-active" : ""}`}>
  <div class="yapmod-plugin-card-body">
    <div class="yapmod-plugin-card-title-row">
      <h3 class="yapmod-plugin-card-name">{manifest.name}</h3>
      <span class={`yapmod-plugin-state ${enabled ? "yapmod-plugin-state-active" : ""}`}>
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
    <p class="yapmod-plugin-card-meta">{meta}</p>
    <p class="yapmod-plugin-card-description">{manifest.description ?? "No description."}</p>
  </div>
  {/* footer */}
</article>
```

The JSX version is immediately scannable as HTML structure, while the createElement version requires parsing JavaScript objects to understand the DOM tree.

# SolidJS Assessment

## SolidJS Assessment

### Component Development

**Boilerplate elimination:** SolidJS would eliminate approximately 40-50% of the DOM construction code. The `createElement()` calls, className joining, conditional class logic, and child array management would be replaced by declarative JSX.

**Component size reduction:**
- `modal.ts` (698 lines) → ~350-400 lines (component + logic separated)
- `settings.ts` (738 lines) → ~300-350 lines (component) + ~200 lines (state management)
- `plugins.ts` (804 lines) → ~300 lines (lifecycle) + ~250 lines (components)
- `dropdown.ts` (498 lines) → ~250-300 lines
- `picker.ts` (502 lines) → ~250-300 lines

**Declarative components:** Components become smaller, more focused, and easier to test. A plugin card becomes a pure function of props, not a factory that builds DOM nodes.

**Reusable primitives:** Shared patterns (gallery, toolbar, card, tabs, search) become composable components instead of duplicated code.

### Reactivity & Performance

**Current update mechanism:** Manual DOM manipulation. When state changes, the affected component re-renders by calling `replaceChildren()` or updating specific nodes. This works but requires careful tracking of what needs updating.

**SolidJS reactivity:** Fine-grained signals automatically track dependencies. When a signal changes, only the affected expressions update. No virtual DOM diffing, no re-rendering of unchanged branches.

**Comparison:**
- **Current:** `renderGallery()` rebuilds the entire gallery on every change
- **SolidJS:** `<For each={themes}>` only updates the changed cards
- **Current:** Modal button state requires manual `target.disabled = true/false`
- **SolidJS:** `<button disabled={loading()}>` updates automatically

**Performance:** For Yapmod's scale (dozens of elements, not thousands), SolidJS would not provide a measurable performance improvement over the current direct-DOM approach. The benefit is **developer experience**, not speed. Both approaches are fast enough.

**Overhead:** SolidJS runtime is ~7KB gzipped. The current client bundles are likely 30-50KB. The overhead is ~15-20% of the total bundle, which is acceptable.

**Lifecycle:** SolidJS provides `onMount`, `onCleanup`, `on` (effects with dependency tracking), and `createEffect`. This replaces manual teardown tracking (`teardowns` arrays, `safeTeardown` calls) with structured lifecycle hooks.

### Integration with Yapmod

**Mounting:** SolidJS components can be mounted into any DOM element via `createRoot()`. The current injection model (preinject/postinject) remains unchanged — SolidJS simply becomes the rendering layer inside the existing architecture.

**DOM coexistence:** SolidJS manages only the DOM nodes it creates. Yapper's DOM remains untouched. The MutationObservers that track Yapper's DOM (settings.ts, banner.ts, postinject.ts) continue to work.

**CSS:** SolidJS does not impose a CSS strategy. The current approach (injected stylesheets) works with SolidJS. CSS can be extracted to separate files during migration.

**Build process:** esbuild supports JSX transformation natively. Adding SolidJS requires:
1. Adding `solid-js` and `solid-js/web` as dependencies
2. Configuring esbuild's JSX transform (`jsx: "transform"`, `jsxImportSource: "solid-js"`)
3. Adding TypeScript JSX type definitions
4. No bundler changes needed — esbuild handles everything

**Incremental adoption:** SolidJS can be adopted incrementally:
1. Start with simple components (dropdown, settings items)
2. Migrate complex components (modal, settings, plugins) gradually
3. Keep direct-DOM code for Yapper integration (MutationObservers, DOM patches)
4. Coexist during migration — no big-bang rewrite needed

**Compatibility risks:**
- **Low risk:** SolidJS does not interfere with Yapper's DOM or the injection model
- **Medium risk:** The settings panel integration relies on observing Yapper's React-managed DOM. SolidJS components inside this area need careful boundary management.
- **Low risk:** CSS injection works the same way with or without SolidJS

### Migration Cost Estimate

| Task | Effort | Notes |
|------|--------|-------|
| Build configuration (esbuild JSX, TypeScript) | 1-2 hours | Straightforward esbuild config |
| TypeScript JSX types | 1 hour | Add `solid-js` types to tsconfig |
| Runtime initialization | 2-3 hours | Create root, mount first component |
| Shared primitives (dropdown, icons, buttons) | 1-2 days | ~5-10 small components |
| Modal component | 1-2 days | Complex but well-structured |
| Settings panel | 2-3 days | Largest component, tight Yapper integration |
| Plugin gallery | 2-3 days | Complex UI with shared patterns |
| Theme picker | 1-2 days | Similar to plugin gallery |
| Banners, updates, defaults | 1-2 days | Smaller components |
| CSS extraction | 2-3 days | Separate styles, establish ownership |
| Testing & regression | 2-3 days | Validate all features |
| **Total** | **~2-3 weeks** | One developer, part-time |

### Long-Term Value

**Reduces total complexity:** Yes. The current codebase has ~5,500 lines. After migration, the equivalent functionality would be ~3,000-3,500 lines (40-45% reduction) with significantly better readability and maintainability.

**Simplifies future features:** New UI features become straightforward component development instead of manual DOM construction. Shared patterns (gallery, cards, tabs) are reusable primitives.

**Does not replace abstractions with abstractions:** SolidJS replaces the `createElement()` pattern with JSX, which is a syntax improvement, not an abstraction layer. The reactivity system replaces manual state tracking, which is a genuine simplification.

### Clear Recommendation

**Adopt SolidJS.** The migration cost is moderate, the long-term benefits are substantial, and the codebase is already component-oriented — SolidJS formalizes that pattern while adding reactivity and a declarative syntax. The alternative (improving createElement()) would provide marginal DX improvement without solving the underlying problems of manual state management and verbose DOM construction.

The only reason not to adopt SolidJS would be if the project strictly requires zero dependencies. Given that the project already depends on `@tauri-apps/api` and `esbuild`, adding SolidJS is a reasonable trade-off.

# CSS Architecture

## CSS Architecture

### Current Problems

1. **Three locations for CSS** with no clear ownership rules:
   - `assets/css/minimum.css` (349 lines) — bundled by esbuild
   - `modal.ts` MODAL_CSS constant (~100 lines) — injected at runtime
   - `picker.styles.ts` (251 lines) — injected at runtime
   - `plugins.styles.ts` (214 lines) — injected at runtime

2. **No naming conventions** beyond the `yapmod-` prefix. Some classes use BEM-like patterns (`.yapmod-modal-overlay`), others use flat names (`.dd-menu`), and some inherit host app classes (`.btn`, `.input`, `.field`).

3. **Theme token usage is inconsistent.** Some selectors use tokens with fallbacks (`var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)))`), others use bare values. The triple-fallback pattern is defensive but verbose.

4. **No CSS linting or analysis.** CSS in TypeScript files cannot be checked by CSS tools.

5. **Duplicate patterns:**
   - `.yapmod-theme-toolbar` and `.yapmod-plugin-toolbar` share identical structure
   - `.yapmod-theme-grid` and `.yapmod-plugin-grid` share identical structure
   - Card layouts (theme cards, plugin cards) share patterns
   - `.yapmod-theme-status` and `.yapmod-plugin-status` are identical

### Proposed CSS Architecture

#### Directory Structure

```
client/
  styles/
    _tokens.css          # CSS custom properties (design tokens)
    _reset.css           # Minimal resets for injected elements
    _components.css      # Shared component styles (buttons, inputs, cards, tabs)
    _layout.css          # Structural styles (grid, flex layouts)
    modal.css            # Modal dialog styles
    settings.css         # Settings panel styles
    plugins.css          # Plugin gallery styles
    themes.css           # Theme picker styles
    banners.css          # Banner notification styles
    updates.css          # Update modal styles
    changelog.css        # Changelog styles
    window-controls.css  # Window control styles
```

#### Ownership Rules

1. **`_tokens.css`** — CSS custom properties for yapmod's own design tokens (`--ym-*`). These are the source of truth for colors, spacing, and radii.

2. **`_reset.css`** — Minimal resets for elements injected into Yapper's DOM (box-sizing, margin normalization, font inheritance).

3. **`_components.css`** — Shared component styles that multiple features use (cards, buttons, inputs, dropdowns, tabs, search fields, toolbars, grids).

4. **Feature-specific files** — Styles for a single feature (modal, settings, plugins, themes, banners, updates, changelog, window controls).

5. **No per-component CSS files** — The codebase is too small to warrant one file per component. Group by feature.

#### Migration Approach

1. Extract CSS from TypeScript files into the new structure.
2. Consolidate duplicate patterns into `_components.css`.
3. Establish the `yapmod-` prefix convention consistently.
4. Standardize token usage: use `var(--ym-token)` with a single fallback, not triple fallbacks.
5. Bundle all CSS into a single stylesheet during build (esbuild can concatenate CSS files).
6. Inject the bundled stylesheet at startup instead of multiple `upsertStyle()` calls.

#### CSS Custom Properties Strategy

The current triple-fallback pattern (`var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)))`) is defensive but excessive. Simplify to:
- `var(--ym-bg-elev)` — yapmod's own token
- The token layer (`tokens.ts`) already maps `--ym-*` to `--*` for the host app
- Bare values as last resort only when no token exists

#### Theme Compatibility

The theme system relies on CSS custom properties and `data-yapmod-theme` / `data-yapmod-mode` attributes. This approach is framework-agnostic and works with SolidJS. No changes needed to the theme architecture.

#### Naming Convention

- **Prefix:** All yapmod classes use `yapmod-` prefix (already mostly consistent)
- **Structure:** `yapmod-{feature}-{element}-{modifier}` (e.g., `yapmod-plugin-card-active`)
- **Shared components:** `yapmod-{component}` (e.g., `yapmod-card`, `yapmod-button`)
- **Internal dropdown:** Keep `dd-` prefix for dropdown internals (already established)

### CSS Extraction from TypeScript

The `*.styles.ts` files would be replaced by actual CSS files. The esbuild build process would:
1. Concatenate all CSS files into a single bundle
2. Inject the bundle at startup via a single `upsertStyle()` call
3. Theme-specific CSS continues to be injected dynamically (it must be)

This eliminates the need for `ensureStyle()` calls scattered across modules.

# Proposed Module Structure

## Proposed Module Structure

### Current Structure

```
client/
  preinject.ts
  postinject.ts
  shared/
    scope.ts
    types.ts
    ui.ts
    modal.ts
    settings.ts
    items.ts
    dropdown.ts
    store.ts
    defaults.ts
    plugins.ts
    plugins.styles.ts
    banner.ts
    desktop.ts
    notify.ts
    links.ts
    update.ts
    release.ts
    tauri.ts
    theme/
      engine.ts
      picker.ts
      picker.styles.ts
      picker-preview.ts
      tokens.ts
      types.ts
  generated/
    types.ts
  assets/
    css/minimum.css
    icon.svg
```

### Proposed Structure (with SolidJS)

```
client/
  # Entry points
  preinject.ts          # API initialization (unchanged)
  postinject.ts         # UI integration (unchanged)

  # Core infrastructure
  core/
    scope.ts            # Global __yapmod object
    store.ts            # Key-value store with IPC persistence
    tauri.ts            # Tauri IPC bridge
    desktop.ts          # Desktop bridge
    links.ts            # External link handling
    notify.ts           # System notifications

  # Shared UI primitives (SolidJS components)
  components/
    dropdown.tsx        # Dropdown component
    modal.tsx           # Modal dialog component
    modal-dialog.tsx    # Individual dialog instance
    icon.tsx            # SVG icon primitives
    button.tsx          # Button variants
    card.tsx            # Card container
    tabs.tsx            # Tab navigation
    gallery.tsx         # Generic gallery (cards + search + tabs)
    toolbar.tsx         # Action toolbar

  # Feature modules
  features/
    settings/
      settings-api.ts   # Settings API (register, unregister, open)
      settings-panel.tsx # Settings panel component
      settings-items.tsx # Settings item renderers
      defaults.tsx      # Default settings sections
      changelog.tsx     # Changelog section
    plugins/
      plugins-api.ts    # Plugin lifecycle & API
      plugins-gallery.tsx # Plugin gallery component
      plugins-card.tsx  # Plugin card component
      plugins-consent.tsx # Consent dialog
      plugins-source.tsx # Source viewer
    themes/
      theme-engine.ts   # Theme application & watchers
      theme-picker.tsx  # Theme gallery component
      theme-preview.tsx # Theme preview rendering
      theme-tokens.ts   # Color token system
    updates/
      update-check.ts   # Update check logic
      update-ui.tsx     # Update modal & banner
    banners/
      banner-api.ts     # Banner API
      banner.tsx        # Banner component

  # Styling
  styles/
    _tokens.css         # Design tokens
    _reset.css          # Minimal resets
    _components.css     # Shared component styles
    modal.css           # Modal styles
    settings.css        # Settings styles
    plugins.css         # Plugin styles
    themes.css          # Theme picker styles
    banners.css         # Banner styles
    updates.css         # Update styles
    changelog.css       # Changelog styles
    window-controls.css # Window control styles

  # Types
  types/
    index.ts            # Re-exported type definitions
    modal.ts            # Modal types
    settings.ts         # Settings types
    plugins.ts          # Plugin types
    themes.ts           # Theme types
    updates.ts          # Update types

  # Generated
  generated/
    types.ts            # Auto-generated from Rust

  # Assets
  assets/
    icon.svg
```

### Module Responsibilities

#### `core/` — Infrastructure
- **Responsibility:** Low-level APIs that don't depend on UI framework
- **Depends on:** Nothing (leaf module)
- **Depended on by:** Everything
- **Public interface:** `getYapmod()`, `invokeCommand()`, `installStore()`, etc.

#### `components/` — Shared UI Primitives
- **Responsibility:** Reusable SolidJS components
- **Depends on:** `core/` (for API access), `types/`
- **Depended on by:** `features/`
- **Public interface:** Component exports (Dropdown, Modal, Icon, etc.)

#### `features/settings/` — Settings Integration
- **Responsibility:** Settings API, panel management, default sections
- **Depends on:** `core/`, `components/`, `types/`
- **Depended on by:** `preinject.ts`
- **Public interface:** `installSettingsApi()`, `installDefaultSettings()`

#### `features/plugins/` — Plugin System
- **Responsibility:** Plugin lifecycle, consent, gallery UI
- **Depends on:** `core/`, `components/`, `types/`
- **Depended on by:** `preinject.ts`
- **Public interface:** `installPluginApi()`, `initializePluginManager()`, `installPluginSettings()`

#### `features/themes/` — Theme System
- **Responsibility:** Theme engine, picker UI, token system
- **Depends on:** `core/`, `components/`, `types/`
- **Depended on by:** `preinject.ts`, `postinject.ts`
- **Public interface:** `installThemeEngine()`, `installThemeSettings()`, `remountThemeStyles()`

#### `features/updates/` — Update System
- **Responsibility:** Update checks, update UI
- **Depends on:** `core/`, `components/`, `types/`
- **Depended on by:** `postinject.ts`
- **Public interface:** `checkForUpdate()`, `prepareClientUpdate()`, UI exports

#### `features/banners/` — Banner Notifications
- **Responsibility:** Banner API, banner component
- **Depends on:** `core/`, `components/`, `types/`
- **Depended on by:** `preinject.ts`, `features/updates/`
- **Public interface:** `installBannerApi()`, `showBanner()`

#### `styles/` — CSS
- **Responsibility:** All styling, organized by feature
- **Depends on:** Nothing
- **Depended on by:** Build process
- **Public interface:** CSS files bundled by esbuild

#### `types/` — Type Definitions
- **Responsibility:** TypeScript interfaces, organized by domain
- **Depends on:** `generated/`
- **Depended on by:** Everything
- **Public interface:** Type exports

### Dependency Direction

```
preinject.ts / postinject.ts
  → features/ (install-* functions)
    → components/ (SolidJS components)
      → core/ (APIs, store, Tauri bridge)
      → types/ (interfaces)
    → core/
    → types/
  → styles/ (bundled CSS)
generated/ (auto-generated types)
```

No circular dependencies. Dependencies flow from features → components → core → types.

# Duplication & Dead Code Audit

## Duplication & Dead Code Audit

### Confirmed Duplication

#### 1. Gallery/Toolbar Pattern (Medium Impact)

**Files:** `picker.ts` (theme gallery) and `plugins.ts` (plugin gallery)

Both implement nearly identical patterns:
- Tab switching (Installed / Community) with `setView()` function
- Search input with filtering logic
- Grid of cards with `renderGallery()` / `renderCommunity()`
- Toolbar with action buttons (Import, Refresh, Open folder)
- Status message area with `setStatus()`
- Async community loading with `loadCommunity()`
- Loading state management (`communityLoaded`, `communityLoading`)

**Lines affected:** ~200 lines in each file are structurally identical.

**Proposed fix:** Extract a generic `<Gallery>` component with tabs, search, and card rendering. Theme and plugin galleries become thin wrappers.

#### 2. SVG Icon Construction (Low Impact)

**Files:** `ui.ts`, `settings.ts`, `plugins.ts`

`createSectionIcon()` in `settings.ts` and `createPluginIcon()` in `plugins.ts` are nearly identical:
```typescript
// settings.ts
const svg = document.createElementNS(SVG_NS, "svg");
svg.setAttribute("class", "yapmod-settings-nav-icon");
svg.setAttribute("width", "24");
// ...
for (const path of SECTION_ICON_SHAPES[name]) {
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
}

// plugins.ts
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "yapmod-plugin-action-icon");
svg.setAttribute("width", "22");
// ...
for (const pathData of PLUGIN_ICON_PATHS[name]) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.append(path);
}
```

**Proposed fix:** A single `<Icon>` component that accepts paths, class, and size.

#### 3. CSS Card Patterns (Low Impact)

**Files:** `picker.styles.ts`, `plugins.styles.ts`

Card layouts share patterns:
- `.yapmod-theme-card` / `.yapmod-plugin-card` — both use flex column, background, border, border-radius
- `.yapmod-theme-card-foot` / `.yapmod-plugin-card-foot` — both use flex, space-between, border-top
- `.yapmod-theme-toolbar` / `.yapmod-plugin-toolbar` — identical structure
- `.yapmod-theme-grid` / `.yapmod-plugin-grid` — identical grid structure
- `.yapmod-theme-status` / `.yapmod-plugin-status` — identical

**Proposed fix:** Consolidate into shared component styles (`_components.css`).

#### 4. className Joining Pattern (Low Impact)

**Files:** Throughout the codebase

```typescript
className: ["base", condition ? "modifier" : ""].filter(Boolean).join(" ")
```

This pattern appears ~30 times. A small `cn()` utility (class names helper) would reduce it to:
```typescript
className: cn("base", { modifier: condition })
```

### No Dead Code Found

Every function, variable, and module is reachable from the execution path. The codebase is lean.

### No Overengineering Found

The abstractions are proportional to the problem. The `createElement()` helper is thin, the store is simple, and the theme engine is straightforward. No unnecessary wrapper functions, excessive indirection, or generic systems that outgrow their use cases.

### Architectural Problems

#### 1. Tight Coupling in settings.ts (Medium)

The settings module tightly couples the API (register/unregister) with the UI (DOM observation, panel management, nav integration). These concerns should be separated:
- `settings-api.ts` — registry, register/unregister, open/refresh
- `settings-panel.tsx` — SolidJS component for rendering panels
- `settings-nav.tsx` — navigation integration with Yapper's DOM

#### 2. Plugin Lifecycle Mixed with UI (Medium)

`plugins.ts` combines plugin lifecycle management (enable/disable, consent, validation) with UI rendering (cards, gallery, modals). These should be separate modules.

#### 3. Modal State Management (Low)

The modal system manages state (open/closed, focus, scroll lock) through instance properties and manual DOM manipulation. SolidJS reactivity would simplify this significantly.

# Tooling & Development Conventions

## Tooling & Development Conventions

### Build Configuration Changes

#### esbuild (build.mjs)

Add JSX transformation for SolidJS:
```javascript
const options = {
  // ... existing options
  jsx: "transform",
  jsxImportSource: "solid-js",
  jsxDev: process.env.NODE_ENV !== "production",
};
```

Add CSS bundling:
```javascript
const options = {
  // ... existing options
  loader: { 
    ".svg": "text",
    ".css": "text",  // bundle CSS as strings
  },
};
```

#### TypeScript (tsconfig.json)

Add JSX support:
```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    // ... existing options
  }
}
```

#### Dependencies

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "solid-js": "^1.9"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "esbuild": "^0.28.2",
    "typescript": "~6.0.3"
  }
}
```

### Coding Conventions

#### Component Naming
- PascalCase for components: `ModalDialog`, `PluginCard`, `ThemePicker`
- kebab-case for file names: `modal-dialog.tsx`, `plugin-card.tsx`
- Prefix shared primitives: `YmDropdown`, `YmIcon`, `YmButton`

#### JSX Conventions
- Use `class` instead of `className` (SolidJS convention)
- Use `for` instead of `htmlFor` (SolidJS convention)
- Use `onclick` instead of `onClick` (SolidJS convention — lowercase events)
- Prefer template literals for conditional classes: `class:list={active && "active"}`
- Use `<Show when={condition}>` for conditional rendering
- Use `<For each={items}>` for list rendering
- Use `<Index each={items}>` when index is needed

#### Component Props
- Define props with `Props` interface
- Use `Component<Props>` type from SolidJS
- Make props readonly where possible
- Provide sensible defaults

#### State Ownership
- Each component owns its local state via `createSignal()`
- Shared state lives in the relevant API module (store, theme engine, plugin registry)
- Use `createMemo()` for derived state
- Use `createEffect()` for side effects with automatic cleanup

#### Event Handlers
- Use SolidJS event delegation (automatic)
- Keep handlers small and focused
- Return cleanup functions from effects

#### CSS Ownership
- Each feature owns its CSS file in `styles/`
- Shared styles live in `_components.css`
- Use `yapmod-` prefix for all classes
- Use CSS custom properties for theming
- No inline styles except dynamic values (e.g., z-index, positioning)

#### Error Handling
- Wrap async operations in try/catch with `[yapmod]` prefix logging
- Never let errors escape the injection boundary
- Use `.catch()` for promise chains

#### Testing
- Manual testing for each feature after migration
- Focus on regression testing for Yapper integration
- Validate all settings, themes, and plugins work correctly

# Migration Roadmap

## Migration Roadmap

### Phase 1: Foundation (Week 1)

**Objectives:** Establish the new architecture, build system, and first components.

**Tasks:**
1. Add SolidJS dependency and configure esbuild for JSX
2. Update TypeScript config for JSX support
3. Create the new directory structure (`core/`, `components/`, `features/`, `styles/`, `types/`)
4. Extract CSS from TypeScript files into `styles/`
5. Bundle CSS with esbuild
6. Create the `core/` module (move scope, store, tauri, desktop, links, notify)
7. Create the `types/` module (organize type definitions)
8. Build the first SolidJS component: `<Icon>`

**Dependencies:** None
**Risks:** Low — infrastructure changes only
**Validation:** Build succeeds, types check, no runtime errors
**Completion:** esbuild produces valid bundles, TypeScript compiles, CSS is bundled

### Phase 2: Shared Primitives (Week 1-2)

**Objectives:** Build the reusable component library.

**Tasks:**
1. Build `<Dropdown>` component (migrate from `dropdown.ts`)
2. Build `<Modal>` and `<ModalDialog>` components (migrate from `modal.ts`)
3. Build `<Button>`, `<Card>`, `<Tabs>`, `<Gallery>`, `<Toolbar>` primitives
4. Extract shared CSS into `_components.css`
5. Validate that primitives work in isolation

**Dependencies:** Phase 1 complete
**Risks:** Low — components are self-contained
**Validation:** Each component renders correctly, events fire, cleanup works
**Completion:** All primitives are functional and tested

### Phase 3: Feature Migration — Settings (Week 2)

**Objectives:** Migrate the settings system to SolidJS.

**Tasks:**
1. Split `settings.ts` into API (`settings-api.ts`) and UI (`settings-panel.tsx`)
2. Migrate settings items to SolidJS components (`settings-items.tsx`)
3. Migrate default settings section
4. Migrate changelog section
5. Maintain Yapper DOM integration (MutationObservers)

**Dependencies:** Phase 2 complete (Dropdown, Modal primitives)
**Risks:** Medium — tight coupling to Yapper's React-managed DOM
**Validation:** Settings open, close, render, and persist correctly
**Completion:** All settings sections work, Yapper integration intact

### Phase 4: Feature Migration — Plugins (Week 2-3)

**Objectives:** Migrate the plugin system to SolidJS.

**Tasks:**
1. Split `plugins.ts` into API (`plugins-api.ts`) and UI components
2. Build plugin gallery component using `<Gallery>` primitive
3. Build plugin card component
4. Build consent dialog component
5. Build source viewer component
6. Maintain plugin lifecycle (enable/disable, consent, validation)

**Dependencies:** Phase 2 complete (shared primitives)
**Risks:** Medium — complex component with many sub-features
**Validation:** Plugins load, enable/disable, consent, gallery renders
**Completion:** Plugin system fully functional with SolidJS components

### Phase 5: Feature Migration — Themes (Week 3)

**Objectives:** Migrate the theme system to SolidJS.

**Tasks:**
1. Migrate theme picker to SolidJS component
2. Migrate theme preview rendering
3. Keep theme engine (`engine.ts`) as-is (no UI, no migration needed)
4. Maintain theme token system

**Dependencies:** Phase 2 complete (shared primitives)
**Risks:** Low — theme picker is similar to plugin gallery
**Validation:** Themes load, apply, preview, and remove correctly
**Completion:** Theme system fully functional with SolidJS components

### Phase 6: Remaining Features (Week 3)

**Objectives:** Migrate remaining features.

**Tasks:**
1. Migrate banner system to SolidJS component
2. Migrate update UI to SolidJS component
3. Migrate release/changelog rendering
4. Update `postinject.ts` to use new components

**Dependencies:** Phase 2 complete
**Risks:** Low — smaller, simpler components
**Validation:** Banners show, updates check, changelog renders
**Completion:** All features migrated

### Phase 7: Cleanup & Validation (Week 3-4)

**Objectives:** Remove old code, validate the migration, establish conventions.

**Tasks:**
1. Remove old `shared/` directory and files
2. Remove `*.styles.ts` files (CSS is now in `styles/`)
3. Consolidate duplicate CSS patterns
4. Final CSS audit and cleanup
5. Comprehensive regression testing
6. Update documentation and conventions
7. Bundle size comparison

**Dependencies:** All previous phases complete
**Risks:** Low — cleanup phase
**Validation:** All features work, no regressions, bundle size acceptable
**Completion:** Codebase is clean, documented, and validated

### Effort Summary

| Phase | Duration | Complexity |
|-------|----------|------------|
| 1. Foundation | 3-4 days | Low |
| 2. Shared Primitives | 3-4 days | Medium |
| 3. Settings | 3-4 days | Medium |
| 4. Plugins | 3-4 days | High |
| 5. Themes | 2-3 days | Medium |
| 6. Remaining | 2-3 days | Low |
| 7. Cleanup | 2-3 days | Low |
| **Total** | **~2-3 weeks** | |

### Regression Risks

1. **Yapper DOM integration** — The settings panel relies on observing Yapper's React-managed DOM. SolidJS components must not interfere with this observation.
2. **CSS specificity** — Extracting CSS may change specificity. Validate all visual elements.
3. **Plugin security** — The consent, validation, and sandboxing logic must remain unchanged.
4. **Theme application** — The theme engine applies CSS before the first frame. This timing must not change.
5. **Event handling** — SolidJS uses event delegation. Validate that all events fire correctly, especially in nested components.

# Alternatives & Trade-offs

## Alternatives & Trade-offs

### Option 1: Current Architecture with Targeted Cleanup

**Approach:** Keep the current architecture, improve `createElement()` abstractions, extract CSS, reduce duplication.

| Criterion | Assessment |
|-----------|------------|
| Developer experience | Slight improvement (better helpers, cleaner CSS) |
| Repetitive code eliminated | ~15% (CSS extraction, shared helpers) |
| Component readability | Slightly better (less nesting with helpers) |
| Architectural simplicity | No change |
| Runtime performance | No change |
| Bundle size | Slightly smaller (CSS deduplication) |
| TypeScript integration | No change |
| CSS separation | Improved (extracted to files) |
| Migration cost | Low (1-2 weeks) |
| Compatibility | No risk |
| Long-term maintainability | Slight improvement |
| Risk of overengineering | None |

**Verdict:** Safe but insufficient. Does not address the core DX problem (verbose DOM construction). Leaves the codebase in the same architectural paradigm.

### Option 2: Improved Direct-DOM with JSX (Custom Runtime)

**Approach:** Add JSX syntax with a minimal custom runtime that compiles to `createElement()` calls.

| Criterion | Assessment |
|-----------|------------|
| Developer experience | Good (JSX syntax, familiar structure) |
| Repetitive code eliminated | ~30% (JSX replaces createElement nesting) |
| Component readability | Much better (declarative JSX) |
| Architectural simplicity | Slightly worse (custom runtime to maintain) |
| Runtime performance | No change (still direct DOM) |
| Bundle size | Slightly larger (JSX runtime) |
| TypeScript integration | Good (custom type definitions) |
| CSS separation | Improved (can extract during migration) |
| Migration cost | Medium (2-3 weeks + ongoing runtime maintenance) |
| Compatibility | Low risk |
| Long-term maintainability | Worse (custom runtime is a maintenance burden) |
| Risk of overengineering | Medium (reinventing framework functionality) |

**Verdict:** Not recommended. Reinvents what SolidJS already does well. The custom runtime becomes a maintenance burden without providing reactivity or lifecycle management.

### Option 3: SolidJS with TypeScript and JSX (Recommended)

**Approach:** Adopt SolidJS as the rendering and reactivity layer.

| Criterion | Assessment |
|-----------|------------|
| Developer experience | Excellent (JSX + reactivity + lifecycle) |
| Repetitive code eliminated | ~40-50% (JSX + reactivity + shared components) |
| Component readability | Much better (declarative, composable) |
| Architectural simplicity | Better (formal component model, clear boundaries) |
| Runtime performance | Equivalent (direct DOM, no virtual DOM) |
| Bundle size | ~15-20% larger (~7KB gzipped runtime) |
| TypeScript integration | Excellent (first-class TypeScript support) |
| CSS separation | Improved (extracted during migration) |
| Migration cost | Medium (2-3 weeks) |
| Compatibility | Low risk (coexists with direct DOM) |
| Long-term maintainability | Much better (established framework, clear patterns) |
| Risk of overengineering | Low (thin runtime, no virtual DOM) |

**Verdict:** Best fit. Provides the most DX improvement for the least architectural cost. The runtime is small, the migration is incremental, and the long-term benefits are substantial.

### Option 4: Preact

**Approach:** Adopt Preact as a lightweight React-compatible framework.

| Criterion | Assessment |
|-----------|------------|
| Developer experience | Good (React-like API) |
| Repetitive code eliminated | ~40% (JSX + components) |
| Component readability | Much better |
| Architectural simplicity | Worse (virtual DOM adds indirection) |
| Runtime performance | Slightly worse (virtual DOM diffing) |
| Bundle size | ~10% larger (~3KB gzipped + JSX runtime) |
| TypeScript integration | Good |
| CSS separation | Improved |
| Migration cost | Medium (2-3 weeks) |
| Compatibility | Low risk |
| Long-term maintainability | Good (established framework) |
| Risk of overengineering | Medium (React ecosystem temptation) |

**Verdict:** Acceptable but inferior to SolidJS. The virtual DOM is unnecessary overhead for this scale. React compatibility is a liability — it encourages importing React ecosystem packages that don't belong in an injected client.

### Preferred Approach: SolidJS

SolidJS is the best fit because:
1. **Direct DOM rendering** matches the current architecture's philosophy
2. **Fine-grained reactivity** eliminates manual state tracking
3. **Small runtime** (~7KB gzipped) is acceptable for the benefits
4. **TypeScript-first** design provides excellent type safety
5. **Incremental adoption** allows gradual migration
6. **No virtual DOM** means no unnecessary overhead
7. **Component model** formalizes the existing component-oriented architecture
8. **Established framework** with active maintenance and a growing ecosystem

The bundle size increase (~15-20%) is the primary trade-off, but it's acceptable given the substantial DX and maintainability improvements.

# Final Recommendations

## Final Recommendations

### Decision 1: Adopt SolidJS

**Recommendation: Yes.** Adopt SolidJS with TypeScript and JSX as the rendering and reactivity layer.

**Rationale:** The codebase is already component-oriented. SolidJS formalizes this pattern while adding reactivity, lifecycle management, and a declarative syntax. The migration cost is moderate (~2-3 weeks), and the long-term benefits are substantial.

**What changes:**
- All UI components migrate to SolidJS JSX
- State management uses SolidJS signals and effects
- Component lifecycle uses SolidJS hooks
- Build system adds JSX transformation

**What stays:**
- The `install-*` API registration pattern
- The store, Tauri bridge, and scope abstractions
- The theme token system
- The plugin security model
- The injection model (preinject/postinject)

### Decision 2: Introduce JSX

**Recommendation: Yes.** JSX via SolidJS.

**Rationale:** JSX eliminates the verbose `createElement()` nesting and makes component structure immediately scannable. It's the primary DX improvement in the migration.

### Decision 3: CSS Separation

**Recommendation: Extract CSS into organized files.**

**Approach:**
- Create `styles/` directory with organized CSS files
- Extract CSS from TypeScript files
- Consolidate duplicate patterns into shared component styles
- Bundle all CSS with esbuild
- Inject as a single stylesheet at startup
- Keep theme CSS dynamic (injected per-theme)

### Decision 4: Module Organization

**Recommendation: Reorganize into clear modules.**

**Structure:**
- `core/` — infrastructure (store, Tauri, scope, desktop, links, notify)
- `components/` — shared SolidJS primitives (dropdown, modal, icon, button, card, gallery)
- `features/` — feature modules (settings, plugins, themes, updates, banners)
- `styles/` — organized CSS
- `types/` — organized type definitions

### Decision 5: Remove Duplication

**Recommendation: Consolidate during migration.**

**Targets:**
- Gallery/toolbar pattern → shared `<Gallery>` component
- SVG icon construction → shared `<Icon>` component
- CSS card patterns → shared component styles
- className joining → `cn()` utility

### Decision 6: What to Do First

1. **Foundation** — build system, directory structure, CSS extraction
2. **Shared primitives** — dropdown, modal, icon, button, card, gallery
3. **Settings** — most complex Yapper integration, tackle early
4. **Plugins** — largest file, most duplication
5. **Themes** — similar to plugins, reuses gallery
6. **Remaining** — banners, updates, changelog
7. **Cleanup** — remove old code, validate, document

### Decision 7: What to Avoid

- **Do not** adopt CSS-in-JS or styled-components. The current CSS approach (injected stylesheets with custom properties) works well for an injected client.
- **Do not** adopt a state management library. SolidJS signals and the existing store are sufficient.
- **Do not** over-modularize. The codebase is ~5,500 lines; 6-8 modules is appropriate, not 20+.
- **Do not** change the injection model. The preinject/postinject pattern is sound.
- **Do not** change the plugin security model. Consent, validation, and content hashing are critical.
- **Do not** introduce a testing framework unless specific regressions are identified. Manual testing is sufficient for this scale.

### Decisions Requiring User Input Before Implementation

1. **SolidJS version** — SolidJS 1.9+ is recommended. Confirm no compatibility constraints.
2. **CSS bundling strategy** — Should all CSS be bundled into a single stylesheet, or should feature-specific CSS be injected lazily? Recommendation: single bundle for simplicity.
3. **Migration pace** — Should the migration be incremental (feature by feature, with each feature working independently) or coordinated (all features migrate together)? Recommendation: incremental.
4. **Backward compatibility** — Should the old `shared/` directory be kept during migration for safety, or removed immediately? Recommendation: keep during migration, remove in cleanup phase.
5. **Bundle size budget** — Is a ~15-20% bundle size increase acceptable? This is the cost of the SolidJS runtime.

# Delivery Steps

### ✓ Step 1: Phase 1: Foundation — Build System & Directory Structure
Establish the new architecture foundation: SolidJS dependency, esbuild JSX configuration, TypeScript JSX types, new directory structure, CSS extraction, and core module migration.

- Add `solid-js` dependency to package.json
- Configure esbuild for JSX transformation (`jsx: "transform"`, `jsxImportSource: "solid-js"`)
- Update tsconfig.json with JSX support (`jsx: "preserve"`, `jsxImportSource: "solid-js"`)
- Create new directory structure: `core/`, `components/`, `features/`, `styles/`, `types/`
- Extract CSS from TypeScript files into `styles/` directory
- Configure esbuild to bundle CSS files
- Move core modules (scope, store, tauri, desktop, links, notify) to `core/`
- Organize type definitions into `types/`
- Validate that the build succeeds and produces valid bundles

### ✓ Step 2: Phase 2: Shared UI Primitives — SolidJS Components
Build the reusable component library that all features will depend on.

- Create `<Icon>` component (consolidates SVG icon construction from ui.ts, settings.ts, plugins.ts)
- Create `<Dropdown>` component (migrate from dropdown.ts, ~498 lines → ~250 lines)
- Create `<Modal>` and `<ModalDialog>` components (migrate from modal.ts, ~698 lines → ~350-400 lines)
- Create `<Button>`, `<Card>`, `<Tabs>`, `<Gallery>`, `<Toolbar>` shared primitives
- Extract shared CSS patterns into `_components.css`
- Validate each component renders correctly, events fire, and cleanup works

### ✓ Step 3: Phase 3: CSS Extraction & Settings Preparation
Extract CSS from TypeScript files into organized styles/ directory, update import paths, and consolidate dropdown styles.

- Created styles/modal.css (extracted from modal.ts MODAL_CSS constant)
- Created styles/plugins.css (extracted from plugins.styles.ts)
- Created styles/themes.css (extracted from picker.styles.ts)
- Created styles/_components.css (shared component styles: cards, toolbar, tabs, grid, dropdown)
- Updated modal.ts to import from styles/modal.css
- Updated plugins.ts to import from styles/plugins.css
- Updated picker.ts to import from styles/themes.css
- Added dropdown styles to minimum.css (bundled at Rust compile time)
- Removed old plugins.styles.ts and picker.styles.ts files
- Fixed Gallery component TypeScript errors
- Bundle sizes unchanged: preinject 77.9kb, postinject 9.9kb

### ✓ Step 4: Phase 4: Plugin Card Components
Create SolidJS components for plugin cards. The settings panel itself cannot use SolidJS because it lives inside Yapper's React-managed DOM — the render function receives a raw HTMLElement host.

- Created InstalledPluginCard and CommunityPluginCard SolidJS components
- Updated Icon component to support strokeWidth and readonly paths
- Plugin card components are ready for use in SolidJS roots (modals, etc.)
- Settings panel rendering remains imperative (Yapper DOM constraint)

### ✓ Step 5: Phase 5: Cleanup, Validation & Documentation
Final cleanup: remove unused code, validate the migration, and commit.

- createPluginIcon and PLUGIN_ICON_PATHS in plugins.ts are still used by the settings panel (Yapper DOM constraint) — cannot remove
- Final build verification passed: TypeScript check clean, bundles unchanged (77.9kb + 9.9kb)
- Committed all changes