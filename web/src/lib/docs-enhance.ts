/**
 * Behaviour for the server-rendered docs pages. The Preact router swaps the
 * `.docs-layout` element on navigation, so this is re-applied after every
 * swap instead of being tied to a component lifecycle.
 */
let controller: AbortController | undefined;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
const copyTimers = new Set<ReturnType<typeof setTimeout>>();

export function cleanupDocsPage(): void {
  controller?.abort();
  controller = undefined;

  clearTimeout(scrollTimer);
  for (const timer of copyTimers) clearTimeout(timer);
  copyTimers.clear();
}

export function enhanceDocsPage(): void {
  cleanupDocsPage();

  const sidebar = document.getElementById("docs-sidebar");
  if (!sidebar) return;

  controller = new AbortController();
  const { signal } = controller;

  // Copy buttons on every code block.
  for (const pre of document.querySelectorAll<HTMLElement>(".prose pre")) {
    if (pre.parentElement?.classList.contains("code-block")) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.replaceWith(wrapper);
    wrapper.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy the code to the clipboard");

    button.addEventListener(
      "click",
      async () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";

        try {
          await navigator.clipboard.writeText(code);
          button.textContent = "Copied";
        } catch {
          button.textContent = "Press Ctrl+C";
        }

        const timer = setTimeout(() => {
          button.textContent = "Copy";
          copyTimers.delete(timer);
        }, 1500);
        copyTimers.add(timer);
      },
      { signal },
    );

    wrapper.append(button);
  }

  // The sidebar toggles on small screens.
  const toggle = document.getElementById("docs-menu");

  toggle?.addEventListener(
    "click",
    () => {
      const open = sidebar.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    },
    { signal },
  );
  toggle?.setAttribute("aria-expanded", "false");

  // Keep the sidebar where the reader left it when they follow a link.
  const key = `yapmod:docs-sidebar:${sidebar.dataset.sidebarArea ?? "main"}`;

  try {
    const saved = sessionStorage.getItem(key);
    if (saved !== null) sidebar.scrollTop = Number(saved);
  } catch {
    // Session storage can be unavailable; the sidebar still works.
  }

  sidebar.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);

      scrollTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(key, String(sidebar.scrollTop));
        } catch {
          // Ignore storage failures.
        }
      }, 120);
    },
    { passive: true, signal },
  );

  // Make the shortcut discoverable.
  const isMac = /mac/i.test(navigator.platform || "");
  for (const hint of document.querySelectorAll<HTMLElement>(".search-hint")) {
    hint.textContent = isMac ? "⌘K" : "Ctrl K";
  }
}
