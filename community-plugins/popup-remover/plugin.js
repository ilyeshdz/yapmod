/**
 * Popup Remover Plugin
 *
 * Removes the Yapin' Plus nudge from the page. The dialog is inserted by the
 * app after load and can reappear at any time, so a MutationObserver watches
 * for new nodes and removes matching dialogs as soon as they are added.
 *
 * The package stylesheet also hides the dialog through the plugin's setting
 * attribute. That avoids a visible flash between insertion and removal, and
 * keeps the popup hidden even if it is added before this script activates.
 */

const NUDGE_SELECTOR = 'div.plus-nudge[role="dialog"]';

export default {
  activate(api) {
    let observer = null;

    /** Removes the nudge itself or any nudge nested inside an added node. */
    function removeNudge(node) {
      if (!(node instanceof Element)) return;

      if (node.matches(NUDGE_SELECTOR)) {
        node.remove();
        return;
      }

      for (const nudge of node.querySelectorAll(NUDGE_SELECTOR)) {
        nudge.remove();
      }
    }

    /** Scans the current document for an already-present nudge. */
    function removeExisting() {
      for (const nudge of document.querySelectorAll(NUDGE_SELECTOR)) {
        nudge.remove();
      }
    }

    /** Starts or stops watching the page based on the setting. */
    function sync() {
      const enabled = api.settings.get("hide-plus-nudge");

      if (!enabled) {
        observer?.disconnect();
        observer = null;
        return;
      }

      removeExisting();

      if (!observer) {
        observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              removeNudge(node);
            }
          }
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }

    api.onCleanup(api.settings.onChange("hide-plus-nudge", sync));
    api.onCleanup(() => {
      observer?.disconnect();
      observer = null;
    });

    sync();

    api.log.info("Popup Remover activated");
  },
};
