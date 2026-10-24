const pendingStyles = new Map<string, string>();
let headObserver: MutationObserver | null = null;

function flushPendingStyles(): void {
  if (!document.head) {
    return;
  }

  headObserver?.disconnect();
  headObserver = null;

  const styles = [...pendingStyles];
  pendingStyles.clear();

  for (const [id, css] of styles) {
    upsertStyle(id, css);
  }
}

/** Creates or updates the stylesheet with this id. */
export function upsertStyle(
  id: string,
  css: string,
): HTMLStyleElement | null {
  const parent = document.head;

  if (!parent) {
    pendingStyles.set(id, css);

    if (!headObserver) {
      headObserver = new MutationObserver(flushPendingStyles);
      headObserver.observe(document, { childList: true, subtree: true });
    }

    return null;
  }

  pendingStyles.delete(id);

  let style = document.getElementById(id) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = id;
  }

  if (style.parentElement !== parent) {
    parent.appendChild(style);
  }

  style.textContent = css;

  return style;
}

/** Adds the stylesheet only if it is not in the document already. */
export function ensureStyle(id: string, css: string): void {
  const style = document.getElementById(id);

  if (!style || (document.head && style.parentElement !== document.head)) {
    upsertStyle(id, css);
  }
}

/** Runs a callback as soon as the body exists, right away if it does. */
export function whenBodyReady(callback: () => void): void {
  if (document.body) {
    callback();
    return;
  }

  document.addEventListener("DOMContentLoaded", () => callback(), {
    once: true,
  });
}

/**
 * Runs each teardown function, catching errors so one failure doesn't
 * prevent the rest from running.
 */
export function safeTeardown(teardowns: (() => void)[]): void {
  for (const teardown of teardowns) {
    try {
      teardown();
    } catch (error) {
      console.error("[yapmod] teardown failed", error);
    }
  }
}
