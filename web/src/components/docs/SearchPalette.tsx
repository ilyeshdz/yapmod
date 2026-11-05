import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { route as navigate } from "preact-router";
import { excerpt, loadIndex, searchIndex, type SearchItem } from "../../lib/search";
import "../../styles/search-palette.css";

/**
 * The documentation search palette. Astro renders it on the server and the
 * Preact island takes over the dialog, keyboard handling and results.
 */
export default function SearchPalette() {
  const [index, setIndex] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => searchIndex(index, query), [index, query]);

  // The keydown listener is registered once, so it reads the latest values
  // through refs instead of a stale effect closure.
  const matchesRef = useRef(matches);
  const activeRef = useRef(active);
  matchesRef.current = matches;
  activeRef.current = active;

  const open = () => {
    if (!dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
    input.current?.focus();
    input.current?.select();
  };

  const scrollActiveIntoView = (position: number) => {
    requestAnimationFrame(() => {
      results.current?.querySelectorAll("a")[position]?.scrollIntoView({ block: "nearest" });
    });
  };

  const move = (step: number) => {
    const total = matchesRef.current.length;
    if (total === 0) return;

    setActive((current) => (current + step + total) % total);
  };

  const submit = () => {
    const item = matchesRef.current[activeRef.current];
    if (!item) return;

    dialog.current?.close();
    navigate(item.url);
  };

  // Reset the selection whenever the result set changes.
  useEffect(() => setActive(0), [matches]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (dialog.current?.open) scrollActiveIntoView(active);
  }, [active]);

  useEffect(() => {
    void loadIndex().then(setIndex);

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
        return;
      }

      if (!dialog.current?.open) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };

    // Delegated so the button keeps working after the router swaps the sidebar.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("#docs-search")) open();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <dialog
      id="search-palette"
      class="palette"
      aria-label="Search the documentation"
      ref={dialog}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      onClose={() => setQuery("")}
    >
      <div class="palette-box">
        <div class="palette-field">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M16.5 16.5 21 21"></path>
          </svg>
          <input
            id="palette-input"
            type="search"
            placeholder="Search the documentation"
            autocomplete="off"
            spellcheck={false}
            aria-controls="palette-results"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
            ref={input}
          />
          <kbd>esc</kbd>
        </div>

        <ul id="palette-results" class="palette-results" role="listbox" aria-label="Search results" ref={results}>
          {matches.length === 0 ? (
            <li class="empty">
              {query ? "Nothing found." : "Type to search the documentation."}
            </li>
          ) : (
            matches.map((item, position) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  class={active === position ? "on" : undefined}
                  onClick={() => dialog.current?.close()}
                >
                  <div class="row">
                    <strong>{item.title}</strong>
                    <span class="group">{item.group}</span>
                  </div>
                  <div class="snippet">
                    {item.description || excerpt(item.text, query)}
                  </div>
                </a>
              </li>
            ))
          )}
        </ul>

        <div class="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </dialog>
  );
}
