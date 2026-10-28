import { useEffect, useRef, useState } from "preact/hooks";
import Router, { type RoutableProps } from "preact-router";
import { cleanupDocsPage, enhanceDocsPage } from "../../lib/docs-enhance";

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");
const DOCS = `${BASE}/docs`;

const normalize = (pathname: string) => pathname.replace(/\/+$/, "") || "/";
const isDocsPath = (pathname: string) =>
  pathname === DOCS || pathname.startsWith(`${DOCS}/`);

function DocsRoute(_props: RoutableProps) {
  return null;
}

function updateHeader(pathname: string) {
  const area = isDocsPath(pathname)
    ? pathname.startsWith(`${DOCS}/plugins`)
      ? "plugins"
      : pathname.startsWith(`${DOCS}/themes`)
        ? "themes"
        : null
    : null;

  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    ".docs-header .header-links a",
  )) {
    const href = link.getAttribute("href");
    link.classList.toggle("on", area !== null && href === `${DOCS}/${area}`);
  }
}

function scrollToTarget(hash: string) {
  if (hash) {
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    return;
  }

  window.scrollTo(0, 0);
}

/**
 * Client-side routing for the documentation.
 *
 * Astro still renders every page to static HTML, which keeps deep links and
 * search engines working. Once mounted, preact-router intercepts docs links,
 * fetches the static page and swaps only the docs layout.
 */
export default function DocsRouter() {
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const current = useRef(0);
  // preact-router updates the history entry before it reports the change, so
  // the browser URL can no longer tell us which page is currently rendered.
  const activePath = useRef(
    normalize(typeof window === "undefined" ? "" : window.location.pathname),
  );

  useEffect(() => {
    enhanceDocsPage();

    return () => {
      controller.current?.abort();
      cleanupDocsPage();
    };
  }, []);

  const swap = async (url: URL, nextPath: string) => {
    const id = ++current.current;
    controller.current?.abort();

    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);

    try {
      const response = await fetch(url.href, {
        headers: { Accept: "text/html" },
        signal: nextController.signal,
      });

      if (!response.ok) {
        window.location.assign(url.href);
        return;
      }

      const html = await response.text();
      if (id !== current.current) return;

      const nextDocument = new DOMParser().parseFromString(html, "text/html");
      const nextLayout = nextDocument.querySelector(".docs-layout");
      const currentLayout = document.querySelector(".docs-layout");

      if (!nextLayout || !currentLayout) {
        window.location.assign(url.href);
        return;
      }

      cleanupDocsPage();
      currentLayout.replaceWith(document.importNode(nextLayout, true));

      document.title = nextDocument.title;

      const description = nextDocument
        .querySelector('meta[name="description"]')
        ?.getAttribute("content");
      const descriptionMeta = document.querySelector('meta[name="description"]');
      if (description && descriptionMeta) descriptionMeta.setAttribute("content", description);

      const canonical = nextDocument
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href");
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonical && canonicalLink) canonicalLink.setAttribute("href", canonical);

      updateHeader(url.pathname);
      enhanceDocsPage();
      activePath.current = nextPath;
      scrollToTarget(url.hash);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.location.assign(url.href);
    } finally {
      if (id === current.current) setLoading(false);
    }
  };

  const onChange = (event: { url: string }) => {
    // preact-router also runs during the server render; navigation only makes
    // sense in the browser.
    if (typeof window === "undefined") return;

    const url = new URL(event.url, window.location.origin);

    if (!isDocsPath(url.pathname)) {
      window.location.assign(url.href);
      return;
    }

    const nextPath = normalize(url.pathname);
    if (nextPath === activePath.current) {
      // Same page: only a hash link needs to move.
      if (url.hash) scrollToTarget(url.hash);
      return;
    }

    void swap(url, nextPath);
  };

  return (
    <>
      <div class={loading ? "docs-progress on" : "docs-progress"} aria-hidden="true" />
      <Router onChange={onChange}>
        <DocsRoute default />
      </Router>
    </>
  );
}
