import { createSignal, JSX, createMemo } from "solid-js";
import { For, Show } from "solid-js/web";

export type GalleryTab = {
  id: string;
  label: string;
};

export type GalleryProps<T> = {
  tabs: GalleryTab[];
  activeTab: () => string;
  onTabChange: (tabId: string) => void;
  items: () => T[];
  emptyMessage: string;
  searchPlaceholder?: string;
  filter?: (item: T, query: string) => boolean;
  renderToolbar?: (onSearch: (query: string) => void) => JSX.Element;
  renderItem: (item: T) => JSX.Element;
  renderStatus?: () => JSX.Element;
};

/**
 * A generic gallery component with tabs, search, and card grid.
 * Used by both theme picker and plugin gallery to eliminate duplication.
 */
export function Gallery<T>(props: GalleryProps<T>): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal("");

  const filteredItems = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return props.items();
    if (!props.filter) return props.items();
    return props.items().filter((item) => props.filter!(item, query));
  });

  const activeTabId = () => props.activeTab();

  return (
    <>
      <div class="yapmod-theme-tabs" role="tablist" aria-label="Collection">
        <For each={props.tabs}>
          {(tab) => (
            <button
              classList={{
                "btn": true,
                "small": true,
                "ghost": true,
                "yapmod-theme-tab-active": activeTabId() === tab.id,
              }}
              type="button"
              role="tab"
              aria-selected={activeTabId() === tab.id}
              onClick={() => props.onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={props.renderToolbar}>
        {(fn) => <>{fn!((query: string) => setSearchQuery(query))}</>}
      </Show>

      <div class="yapmod-theme-grid">
        <Show when={filteredItems().length > 0} fallback={
          <p class="hint">{props.emptyMessage}</p>
        }>
          <For each={filteredItems()}>
            {(item) => props.renderItem(item)}
          </For>
        </Show>
      </div>

      <Show when={props.renderStatus}>
        {(fn) => <>{fn()}</>}
      </Show>
    </>
  );
}
