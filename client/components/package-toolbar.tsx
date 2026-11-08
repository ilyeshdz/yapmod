import type { JSX } from "solid-js";
import { Dropdown, type DropdownOption } from "./dropdown";

export type PackageToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  filter: string;
  filterOptions: DropdownOption[];
  onFilterChange: (value: string) => void;
  placeholder: string;
  /** Buttons shown after the search and filter controls. */
  children?: JSX.Element;
};

/** The shared search and installation-state filter used by both galleries. */
export function PackageToolbar(props: PackageToolbarProps): JSX.Element {
  return (
    <div class="yapmod-package-toolbar">
      <input
        class="input yapmod-package-search"
        type="search"
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        value={props.query}
        onInput={(event) => props.onQueryChange(event.currentTarget.value)}
      />
      <Dropdown
        class="input yapmod-package-filter"
        value={props.filter}
        options={props.filterOptions}
        onChange={props.onFilterChange}
        ariaLabel="Filter by installation state"
      />
      <div class="yapmod-package-toolbar-actions">{props.children}</div>
    </div>
  );
}
