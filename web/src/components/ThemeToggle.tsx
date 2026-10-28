/**
 * Colour-theme switch. The current theme is read from the html element, which
 * the inline script in the layout sets before first paint.
 */
export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const current = root.dataset.theme || (prefersLight ? "light" : "dark");
    const next = current === "dark" ? "light" : "dark";

    root.dataset.theme = next;
    try {
      localStorage.setItem("yapmod-theme", next);
    } catch {
      // Ignore storage failures, the theme still applies for this session.
    }
  };

  return (
    <button
      class="theme-toggle"
      type="button"
      id="theme-toggle"
      aria-label="Toggle color theme"
      onClick={toggle}
    >
      <svg
        class="icon-moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
      </svg>
      <svg
        class="icon-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2"></circle>
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"></path>
      </svg>
    </button>
  );
}
