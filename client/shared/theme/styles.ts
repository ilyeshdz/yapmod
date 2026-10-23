const THEME_STYLE_ID = "yapmod-theme-styles";

/** Adds or updates the theme stylesheet and keeps it last in the page head. */
export function mountThemeStyles(css: string): void {
  const parent = document.head ?? document.documentElement;

  if (!parent) {
    return;
  }

  let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = THEME_STYLE_ID;
  }

  if (style.textContent !== css) {
    style.textContent = css;
  }

  if (style.parentElement !== parent || parent.lastElementChild !== style) {
    parent.appendChild(style);
  }
}

/** Moves the preinject stylesheet behind the app's stylesheets after load. */
export function remountThemeStyles(): void {
  const style = document.getElementById(THEME_STYLE_ID);
  const parent = document.head ?? document.documentElement;

  if (!style || !parent) {
    return;
  }

  if (style.parentElement !== parent || parent.lastElementChild !== style) {
    parent.appendChild(style);
  }
}
