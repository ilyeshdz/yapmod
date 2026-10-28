/**
 * Runs a widget after every page load.
 *
 * `ClientRouter` keeps the document alive across navigations: it swaps the body
 * and re-runs nothing else. Element listeners therefore have to be attached
 * again on each page, and listeners on `document` have to be removed on the way
 * out so they do not pile up or act on a page that no longer exists.
 */
export function onPageLoad(init: (signal: AbortSignal) => void): void {
  let controller: AbortController | undefined;

  const teardown = () => {
    controller?.abort();
    controller = undefined;
  };

  document.addEventListener("astro:before-swap", teardown);

  document.addEventListener("astro:page-load", () => {
    teardown();
    controller = new AbortController();
    init(controller.signal);
  });
}
