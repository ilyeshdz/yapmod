/**
 * The self-hosted web loader.
 *
 * This MAIN-world content script replaces the statically bundled client for
 * unpacked and self-hosted builds. It reads the verified bundle the bridge
 * staged on the previous load and falls back to the client embedded in the
 * package, exactly like the desktop shell falls back to its embedded client.
 */
import {
  activeCachedBundle,
  writeCachedBundle,
  removeCachedBundle,
} from "./update-cache";

declare const __YAPMOD_EMBEDDED_CLIENT__: string;

function run(code: string): void {
  const script = document.createElement("script");

  script.textContent = code;
  (document.head ?? document.documentElement).appendChild(script);
  script.remove();
}

function execute(code: string): boolean {
  try {
    run(code);

    return true;
  } catch (error) {
    console.error("[yapmod] the staged client could not start", error);

    return false;
  }
}

const cached = activeCachedBundle();
let started = false;

if (cached) {
  // Claim the attempt before running. If the client never boots, the next
  // load sees an unconfirmed bundle with one attempt and reverts.
  writeCachedBundle({ ...cached, attempts: cached.attempts + 1 });
  started = execute(cached.preinject);

  if (!started) {
    removeCachedBundle();
  }
}

if (!started) {
  execute(__YAPMOD_EMBEDDED_CLIENT__);
}
