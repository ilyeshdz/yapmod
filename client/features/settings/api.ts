import type {
  SettingsContext,
  SettingsSection,
  YapmodSettingsApi,
} from "../../shared/types";
import { safeTeardown, whenBodyReady } from "../../shared/ui";
import { closeAllDropdowns } from "../../components/dropdown";
import { getYapmod } from "../../core/scope";
import { createSettingsPanel } from "./settings-panel";
import { mountSettingsItems } from "./settings-items";
import {
  createNavButton,
  createNavLabel,
} from "./settings-nav";

const ACTIVE_CLASS = "yapmod-section-active";
const PANEL_CLASS = "yapmod-settings-panel";
const NAV_ATTRIBUTE = "data-yapmod-section";
const DEFAULT_GROUP = "Yapmod";
const OPEN_TIMEOUT_MS = 3000;

type SectionEntry = {
  section: SettingsSection;
  button: HTMLButtonElement;
  panel: HTMLElement | null;
  /** Teardown of the custom `render` function of the section. */
  teardowns: (() => void)[];
  /** Disposes the Solid root that renders the declared items. */
  itemsDispose: (() => void) | null;
  /** Disposes the Solid root that renders the panel shell. */
  panelDispose: (() => void) | null;
};

type NavGroup = {
  label: HTMLElement;
  entries: SectionEntry[];
};

const registry = new Map<string, SectionEntry>();
const groups = new Map<string, NavGroup>();

let root: HTMLElement | null = null;
let nav: HTMLElement | null = null;
let main: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let activeId: string | null = null;
let pendingOpenId: string | null = null;
let nativeMainWasHidden: HTMLElement["hidden"] = false;
let nativeMainHiddenByUs = false;
let bodyObserver: MutationObserver | null = null;
let rootObserver: MutationObserver | null = null;
let navObserver: MutationObserver | null = null;

function isSettingsRoot(candidate: HTMLElement): boolean {
  return (
    candidate.querySelector(":scope > .settings-nav") !== null &&
    candidate.querySelector(
      `:scope > .settings-main:not(.${PANEL_CLASS})`,
    ) !== null
  );
}

function findSettingsRoot(): HTMLElement | null {
  for (const candidate of document.querySelectorAll<HTMLElement>(".settings")) {
    if (isSettingsRoot(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findSettingsTrigger(): HTMLElement | null {
  const selectors = [
    '[aria-label="Settings"]',
    '[title="Settings"]',
    '[aria-label="User Settings"]',
    '[title="User Settings"]',
  ];

  for (const selector of selectors) {
    for (const candidate of document.querySelectorAll<HTMLElement>(selector)) {
      if (candidate.getClientRects().length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

function createContext(entry: SectionEntry): SettingsContext {
  return {
    id: entry.section.id,
    refresh: () => refreshSection(entry),
  };
}

function ensurePanel(entry: SectionEntry): HTMLElement {
  if (entry.panel) {
    return entry.panel;
  }

  const context = createContext(entry);
  const handle = createSettingsPanel(entry.section);

  entry.panel = handle.element;
  entry.panelDispose = handle.dispose;

  if (handle.itemsHost && entry.section.items?.length) {
    entry.itemsDispose = mountSettingsItems(
      entry.section.items,
      handle.itemsHost,
      context,
    );
  }

  if (handle.bodyHost && entry.section.render) {
    const teardown = entry.section.render(handle.bodyHost, context);

    if (typeof teardown === "function") {
      entry.teardowns.push(teardown);
    }
  }

  return entry.panel;
}

function refreshSection(entry: SectionEntry): void {
  const host = entry.panel?.querySelector<HTMLElement>(
    ":scope > .yapmod-settings > .yapmod-settings-items",
  );

  if (!host) {
    return;
  }

  entry.itemsDispose?.();
  entry.itemsDispose = null;
  host.replaceChildren();

  if (entry.section.items?.length) {
    entry.itemsDispose = mountSettingsItems(
      entry.section.items,
      host,
      createContext(entry),
    );
  }
}

function mountPanel(entry: SectionEntry): HTMLElement {
  const target = ensurePanel(entry);

  if (root && target.parentElement !== root) {
    root.insertBefore(target, main?.nextElementSibling ?? null);
  }

  return target;
}

function ensureGroup(name: string): NavGroup {
  const existing = groups.get(name);

  if (existing) {
    return existing;
  }

  const group: NavGroup = {
    label: createNavLabel(name),
    entries: [],
  };

  groups.set(name, group);

  return group;
}

function mountNav(): void {
  if (!nav) {
    return;
  }

  const entries = [...groups.values()].flatMap((group) => [
    group.label,
    ...group.entries.map((entry) => entry.button),
  ]);
  let reference: Element | null = nav.querySelector<HTMLElement>(
    ":scope > .plus-nav",
  );

  // Reinsert only nodes React removed or moved. Avoiding remove/insert churn
  // keeps the observer quiet during normal section registration.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry.parentElement !== nav || entry.nextElementSibling !== reference) {
      nav.insertBefore(entry, reference);
    }

    reference = entry;
  }
}

function handleNavClick(event: Event): void {
  const target = event.target as Element | null;
  const button = target?.closest<HTMLElement>("button");

  if (!button) {
    return;
  }

  const id = button.getAttribute(NAV_ATTRIBUTE);

  if (id) {
    event.preventDefault();
    event.stopPropagation();
    activate(id);
    return;
  }

  deactivate();
}

function bindNav(element: HTMLElement): void {
  // The dataset value is an empty string, which is falsy, so check for the
  // attribute's presence instead. Otherwise every re-attach adds a listener.
  if (element.hasAttribute("data-yapmod-nav-bound")) {
    return;
  }

  element.dataset.yapmodNavBound = "";
  element.addEventListener("click", handleNavClick);
}

function observeNav(element: HTMLElement): void {
  navObserver?.disconnect();

  navObserver = new MutationObserver((records) => {
    if (!nav) {
      return;
    }

    // React may drop our entries; put them back.
    let missing = false;

    for (const group of groups.values()) {
      if (group.label.parentElement !== nav) {
        missing = true;
        break;
      }

      for (const entry of group.entries) {
        if (entry.button.parentElement !== nav) {
          missing = true;
          break;
        }
      }

      if (missing) {
        break;
      }
    }

    if (missing) {
      mountNav();
    }

    if (!activeId) {
      return;
    }

    const entry = registry.get(activeId);

    if (!entry) {
      return;
    }

    for (const record of records) {
      if (
        record.type !== "attributes" ||
        record.attributeName !== "class" ||
        !(record.target instanceof HTMLButtonElement)
      ) {
        continue;
      }

      const button = record.target;

      if (button === entry.button) {
        // Only write when the class actually changes: adding a class that is
        // already there still queues a mutation record, which would retrigger
        // this observer forever and freeze the page.
        if (!button.classList.contains("active")) {
          button.classList.add("active");
        }
      } else if (button.classList.contains("active")) {
        button.classList.remove("active");
      }
    }
  });

  navObserver.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}

function observeRoot(element: HTMLElement): void {
  rootObserver?.disconnect();

  rootObserver = new MutationObserver(() => {
    if (!root) {
      return;
    }

    // React may swap the native panel out; keep it hidden and re-attach ours.
    const currentMain = root.querySelector<HTMLElement>(
      `:scope > .settings-main:not(.${PANEL_CLASS})`,
    );

    if (currentMain && currentMain !== main) {
      main = currentMain;
      nativeMainHiddenByUs = false;

      if (activeId) {
        hideNativeMain();
      }
    }

    for (const entry of registry.values()) {
      if (entry.panel && entry.panel.parentElement !== root) {
        root.insertBefore(entry.panel, main?.nextElementSibling ?? null);
      }
    }
  });

  rootObserver.observe(element, { childList: true });
}

/**
 * Hides the native panel.
 *
 * The attribute works without any stylesheet of ours, the class keeps it
 * hidden even if React swaps the native element out from under us.
 */
function hideNativeMain(): void {
  if (!main || nativeMainHiddenByUs) {
    return;
  }

  nativeMainWasHidden = main.hidden;
  main.hidden = true;
  nativeMainHiddenByUs = true;
}

function restoreNativeMain(): void {
  if (!main || !nativeMainHiddenByUs) {
    return;
  }

  main.hidden = nativeMainWasHidden;
  nativeMainHiddenByUs = false;
}

function activate(id: string): void {
  const entry = registry.get(id);

  if (!entry || !root || !nav) {
    return;
  }

  if (activeId === id) {
    // Already open: make sure the panel is still attached, but do not
    // re-announce the section.
    mountPanel(entry);
    return;
  }

  const previous = activeId ? registry.get(activeId) : undefined;

  const target = mountPanel(entry);

  // Hide the panel of the section we are leaving, otherwise both panels
  // end up side by side.
  if (previous && previous !== entry) {
    if (previous.panel) {
      previous.panel.hidden = true;
    }

    try {
      previous.section.onHide?.();
    } catch (error) {
      console.error("[yapmod] settings section failed to hide", error);
    }
  }

  for (const button of nav.querySelectorAll<HTMLElement>("button.active")) {
    if (button !== entry.button) {
      button.classList.remove("active");
    }
  }

  entry.button.classList.add("active");

  root.classList.add(ACTIVE_CLASS);
  hideNativeMain();
  target.hidden = false;
  panel = target;
  activeId = id;

  try {
    entry.section.onShow?.();
  } catch (error) {
    console.error("[yapmod] settings section failed to show", error);
  }
}

function deactivate(): void {
  if (!root) {
    return;
  }

  // The menus of the dropdowns live outside the panel, so they are closed
  // before it disappears.
  closeAllDropdowns();

  root.classList.remove(ACTIVE_CLASS);

  for (const entry of registry.values()) {
    entry.button.classList.remove("active");
  }

  restoreNativeMain();

  if (panel) {
    panel.hidden = true;
  }

  const entry = activeId ? registry.get(activeId) : undefined;
  activeId = null;

  try {
    entry?.section.onHide?.();
  } catch (error) {
    console.error("[yapmod] settings section failed to hide", error);
  }
}

function attach(found: HTMLElement): void {
  const navElement = found.querySelector<HTMLElement>(":scope > .settings-nav");
  const mainElement = found.querySelector<HTMLElement>(
    `:scope > .settings-main:not(.${PANEL_CLASS})`,
  );

  if (!navElement || !mainElement) {
    return;
  }

  root = found;
  nav = navElement;
  main = mainElement;

  bindNav(navElement);
  observeRoot(found);
  observeNav(navElement);
  mountNav();

  if (pendingOpenId) {
    const id = pendingOpenId;
    pendingOpenId = null;
    activate(id);
  }
}

function detach(): void {
  if (!root) {
    return;
  }

  deactivate();

  rootObserver?.disconnect();
  rootObserver = null;
  navObserver?.disconnect();
  navObserver = null;

  root = null;
  nav = null;
  main = null;
  panel = null;
}

function sync(): void {
  if (registry.size === 0) {
    return;
  }

  const found = findSettingsRoot();

  if (!found) {
    detach();
    return;
  }

  if (found !== root) {
    detach();
    attach(found);
  }
}

function ensureObserver(): void {
  if (bodyObserver) {
    return;
  }

  bodyObserver = new MutationObserver(() => {
    sync();
  });

  whenBodyReady(() => {
    if (bodyObserver) {
      bodyObserver.observe(document.body, { childList: true });
    }
  });
}

function register(section: SettingsSection): () => void {
  unregister(section.id);

  const button = createNavButton(section);

  const entry: SectionEntry = {
    section,
    button,
    panel: null,
    teardowns: [],
    itemsDispose: null,
    panelDispose: null,
  };

  registry.set(section.id, entry);

  const group = ensureGroup(section.group ?? DEFAULT_GROUP);
  group.entries.push(entry);
  group.entries.sort(
    (left, right) => (left.section.order ?? 0) - (right.section.order ?? 0),
  );

  ensureObserver();

  // The modal may already be open, so attach now instead of waiting for a
  // mutation that might never come.
  const found = findSettingsRoot();

  if (found && found !== root) {
    detach();
    attach(found);
  } else if (root) {
    mountNav();
  }

  return () => unregister(section.id);
}

function unregister(id: string): void {
  const entry = registry.get(id);

  if (!entry) {
    return;
  }

  if (activeId === id) {
    deactivate();
  }

  safeTeardown(entry.teardowns.splice(0));
  entry.itemsDispose?.();
  entry.itemsDispose = null;
  entry.panelDispose?.();
  entry.panelDispose = null;

  entry.panel?.remove();
  entry.panel = null;
  entry.button.remove();
  registry.delete(id);

  for (const [name, group] of [...groups]) {
    const index = group.entries.indexOf(entry);

    if (index !== -1) {
      group.entries.splice(index, 1);
    }

    if (group.entries.length === 0) {
      group.label.remove();
      groups.delete(name);
    }
  }

  if (registry.size === 0) {
    bodyObserver?.disconnect();
    bodyObserver = null;
    detach();
  }
}

function open(id: string): void {
  if (!registry.has(id)) {
    return;
  }

  const found = findSettingsRoot();

  if (found) {
    if (found !== root) {
      detach();
      attach(found);
    }

    activate(id);
    return;
  }

  const trigger = findSettingsTrigger();

  if (!trigger) {
    return;
  }

  pendingOpenId = id;
  trigger.click();

  window.setTimeout(() => {
    pendingOpenId = null;
  }, OPEN_TIMEOUT_MS);
}

function refresh(id?: string): void {
  if (id) {
    const entry = registry.get(id);

    if (entry) {
      refreshSection(entry);
    }

    return;
  }

  for (const entry of registry.values()) {
    refreshSection(entry);
  }
}

const settingsApi: YapmodSettingsApi = {
  register,
  unregister,
  open,
  refresh,
  get sections(): readonly SettingsSection[] {
    return [...registry.values()].map((entry) => entry.section);
  },
  get active(): string | null {
    return activeId;
  },
};

export function installSettingsApi(): void {
  getYapmod().settings = settingsApi;
}
