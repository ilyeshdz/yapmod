import type { SettingsSection } from "../types";
import type { CommunityTheme, ThemeBundle } from "./types";
import { createElement, ensureStyle } from "../ui";
import { createDropdown } from "../dropdown";
import { getYapmod } from "../scope";
import { resolveMode } from "./engine";
import { appPalette, readTokens, TOKENS } from "./tokens";
import { openExternally } from "../links";

const SECTION_ID = "yapmod-themes";

/**
 * The section sits in the group of the client, right under its own item.
 */
const GROUP_LABEL = "Yapmod";
const UI_STYLE_ID = "yapmod-theme-ui-styles";

/**
 * The styles of the theme gallery.
 *
 * They only use the tokens of a theme, so the gallery looks the same in
 * every theme, including the one it is showing.
 */
const THEME_UI_CSS = `
.yapmod-theme-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 14px;
}

.yapmod-theme-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.yapmod-theme-tab-active {
  border-color: var(--ym-accent, var(--accent, #ff6b4a)) !important;
  color: var(--ym-accent, var(--accent, #ff6b4a)) !important;
}

.yapmod-theme-community-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.yapmod-theme-search {
  flex: 1;
  min-width: 120px;
}

.yapmod-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}

.yapmod-theme-grid[hidden],
.yapmod-theme-toolbar[hidden],
.yapmod-theme-community-toolbar[hidden] {
  display: none;
}

.yapmod-theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--ym-bg-elev, var(--bg-elev, rgba(127, 127, 127, 0.06)));
  border: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.25)));
  border-radius: var(--ym-radius, var(--radius, 10px));
  transition: border-color 0.12s ease;
}

.yapmod-theme-card:hover {
  border-color: var(--ym-accent, var(--accent, #ff6b4a));
}

.yapmod-theme-card.yapmod-theme-active {
  border-color: var(--ym-accent, var(--accent, #ff6b4a));
  box-shadow: 0 0 0 1px var(--ym-accent, var(--accent, #ff6b4a)) inset;
}

.yapmod-theme-card-pick {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px 10px 6px;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
}

.yapmod-theme-card-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 6px;
}

.yapmod-theme-card-pick:focus-visible {
  outline: 2px solid var(--ym-accent, var(--accent, #ff6b4a));
  outline-offset: 2px;
}

.yapmod-theme-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 6px 8px 10px;
}

.yapmod-theme-remove {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--ym-text-muted, var(--text-muted, #9c9daa));
  font-size: 16px;
  line-height: 1;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.yapmod-theme-remove:hover,
.yapmod-theme-remove:focus-visible {
  opacity: 1;
  color: var(--ym-danger, var(--danger, #f2555a));
  outline: none;
}

.yapmod-theme-preview {
  display: grid;
  grid-template-columns: 10px 34px 1fr;
  height: 74px;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid var(--ym-border, var(--border, rgba(127, 127, 127, 0.2)));
}

.yapmod-theme-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.yapmod-theme-preview-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 6px;
}

.yapmod-theme-preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.yapmod-theme-preview-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 4px;
}

.yapmod-theme-preview-line {
  height: 4px;
  border-radius: 2px;
}

.yapmod-theme-preview-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}

.yapmod-theme-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.yapmod-theme-preview-title {
  width: 34%;
  height: 5px;
  border-radius: 3px;
}

.yapmod-theme-preview-badge {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.yapmod-theme-preview-bubble {
  height: 9px;
  width: 62%;
  border-radius: 4px;
}

.yapmod-theme-preview-bubble.mine {
  width: 44%;
  align-self: flex-end;
}

.yapmod-theme-preview-input {
  height: 10px;
  width: 100%;
  margin-top: auto;
  border-radius: 5px;
}

.yapmod-theme-card-name {
  font-weight: 600;
  font-size: 0.95em;
}

.yapmod-theme-card-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.82em;
  opacity: 0.72;
}

.yapmod-theme-install {
  flex: none;
}

.yapmod-theme-install:disabled {
  opacity: 0.65;
  cursor: default;
}

.yapmod-theme-card-meta {
  font-size: 0.8em;
  opacity: 0.65;
}

.yapmod-theme-field {
  margin-top: 18px;
}

.yapmod-theme-status {
  margin: 12px 0 0;
}

.yapmod-theme-status.yapmod-theme-status-error {
  color: var(--ym-danger, var(--danger, #d9485f));
}
`;

/**
 * The colour a token falls back to.
 */
function fallback(name: string): string {
  return TOKENS.find((token) => token.name === name)?.dark ?? "transparent";
}

/**
 * The value the app uses for one of its variables right now.
 */
function appValue(name: string, fallbackValue: string): string {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${name}`)
      .trim();

    return value || fallbackValue;
  } catch {
    return fallbackValue;
  }
}

/**
 * The mode the app is in right now.
 */
function appMode(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * The colours a preview is drawn with.
 */
type Swatches = {
  rail: string;
  side: string;
  main: string;
  elev: string;
  active: string;
  input: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  radius: number;
};

/**
 * The colours of a theme, or of the app when there is no theme.
 */
function swatchesOf(theme: ThemeBundle | null): Swatches {
  const mode = theme ? resolveMode(theme) : appMode();

  if (!theme) {
    // The card of the app's own theme shows the palette of the app, even
    // while another theme is applied.
    const palette = appPalette(mode);

    return {
      rail: palette["bg-rail"] ?? appValue("bg-rail", fallback("bg-rail")),
      side: palette["bg-side"] ?? appValue("bg-side", fallback("bg-side")),
      main: palette["bg-main"] ?? appValue("bg-main", fallback("bg-main")),
      elev: palette["bg-elev"] ?? appValue("bg-elev", fallback("bg-elev")),
      active: palette["bg-active"] ?? appValue("bg-active", fallback("bg-active")),
      input: palette["bg-input"] ?? appValue("bg-input", fallback("bg-input")),
      text: palette["text"] ?? appValue("text", fallback("text")),
      muted:
        palette["text-muted"] ?? appValue("text-muted", fallback("text-muted")),
      border: palette["border"] ?? appValue("border", fallback("border")),
      accent: palette["accent"] ?? appValue("accent", fallback("accent")),
      accentSoft:
        palette["accent-soft"] ??
        appValue("accent-soft", fallback("accent-soft")),
      radius: radiusOf(palette["radius"] ?? appValue("radius", fallback("radius"))),
    };
  }

  const tokens = readTokens(theme.css, mode);
  const pick = (name: string, variable: string): string =>
    tokens[name] ?? appValue(variable, fallback(name));

  return {
    rail: pick("bg-rail", "bg-rail"),
    side: pick("bg-side", "bg-side"),
    main: pick("bg-main", "bg-main"),
    elev: pick("bg-elev", "bg-elev"),
    active: pick("bg-active", "bg-active"),
    input: pick("bg-input", "bg-input"),
    text: pick("text", "text"),
    muted: pick("text-muted", "text-muted"),
    border: pick("border", "border"),
    accent: pick("accent", "accent"),
    accentSoft: pick("accent-soft", "accent-soft"),
    radius: radiusOf(pick("radius", "radius")),
  };
}

/**
 * The roundness of a theme, small enough to fit in a preview.
 */
function radiusOf(value: string): number {
  const radius = Number.parseFloat(value);

  return Number.isFinite(radius) ? Math.min(Math.max(radius, 0), 8) : 4;
}

function block(
  className: string,
  style: Record<string, string>,
  children: Node[] = [],
): HTMLElement {
  const element = createElement("span", { className });

  element.setAttribute(
    "style",
    Object.entries(style)
      .map(([name, value]) => `${name}: ${value}`)
      .join("; "),
  );

  element.append(...children);

  return element;
}

/**
 * A small picture of a theme.
 *
 * The colours come from the stylesheet of the theme itself, so a preview
 * can never be out of date. A theme that ships a picture of its own uses
 * that instead.
 */
function createPreview(theme: ThemeBundle | null): HTMLElement {
  if (theme?.preview) {
    return createElement("span", {
      className: "yapmod-theme-preview",
      children: [
        createElement("img", {
          attrs: {
            src: theme.preview,
            alt: "",
          },
        }),
      ],
    });
  }

  const colors = swatchesOf(theme);

  const rail = block("yapmod-theme-preview-rail", {
    background: colors.rail,
  }, [
    block("yapmod-theme-preview-dot", { background: colors.accent }),
    block("yapmod-theme-preview-dot", {
      background: colors.elev,
      opacity: "0.8",
    }),
  ]);

  const side = block("yapmod-theme-preview-side", {
    background: colors.side,
  }, [
    block("yapmod-theme-preview-line", {
      background: colors.muted,
      opacity: "0.55",
    }),
    block("yapmod-theme-preview-line", {
      background: colors.active,
      width: "80%",
    }),
    block("yapmod-theme-preview-line", {
      background: colors.muted,
      opacity: "0.35",
      width: "70%",
    }),
  ]);

  const main = block("yapmod-theme-preview-main", {
    background: colors.main,
  }, [
    block("yapmod-theme-preview-head", {}, [
      block("yapmod-theme-preview-title", {
        background: colors.text,
        opacity: "0.75",
      }),
      block("yapmod-theme-preview-badge", {
        background: colors.accent,
      }),
    ]),
    block("yapmod-theme-preview-bubble", {
      background: colors.elev,
      border: `1px solid ${colors.border}`,
      borderRadius: `${colors.radius}px`,
    }),
    block("yapmod-theme-preview-bubble mine", {
      background: colors.accentSoft,
      borderRadius: `${colors.radius}px`,
    }),
    block("yapmod-theme-preview-input", {
      background: colors.input,
      border: `1px solid ${colors.border}`,
      borderRadius: `${colors.radius}px`,
    }),
  ]);

  return createElement("span", {
    className: "yapmod-theme-preview",
    children: [rail, side, main],
  });
}

/**
 * Asks before a theme is deleted.
 */
function confirmRemove(name: string): Promise<boolean> {
  const modalApi = getYapmod().modal;

  if (!modalApi) {
    return Promise.resolve(window.confirm(`Remove the theme "${name}"?`));
  }

  return new Promise<boolean>((resolve) => {
    modalApi.show({
      title: "Remove theme",
      description: `"${name}" will be deleted from your themes folder.`,
      buttons: [
        {
          label: "Cancel",
          variant: "secondary",
        },
        {
          label: "Remove",
          variant: "danger",
          onClick: (modal) => {
            resolve(true);
            modal.close("button");
          },
        },
      ],
      onClose: () => {
        resolve(false);
      },
    });
  });
}

/**
 * The section that holds the theme gallery.
 */
function createThemeSection(): SettingsSection {
  return {
    id: SECTION_ID,
    label: "Themes",
    icon: "palette",
    group: GROUP_LABEL,
    order: 1,
    description:
      "Change how yapmod looks. A theme is a folder with a manifest and a stylesheet, and it is applied to the whole app.",
    render: (host) => {
      let cancelled = false;

      const themeApi = getYapmod().theme;
      const store = getYapmod().store;

      let installedThemes: ThemeBundle[] = [];
      let communityThemes: CommunityTheme[] = [];
      let communityLoaded = false;
      let communityLoading = false;
      let searchQuery = "";

      const gallery = createElement("div", { className: "yapmod-theme-grid" });
      const communityGallery = createElement("div", {
        className: "yapmod-theme-grid",
        props: { hidden: true },
      });
      const status = createElement("p", {
        className: "hint yapmod-theme-status",
      });

      const setStatus = (message: string, isError = false): void => {
        status.textContent = message;
        status.classList.toggle("yapmod-theme-status-error", isError);
      };

      const activeId = (): string => store?.get<string>("theme_id", "") ?? "";

      const tabs = createElement("div", {
        className: "yapmod-theme-tabs",
        attrs: { role: "tablist", "aria-label": "Theme collection" },
      });

      const installedTab = createElement("button", {
        className: "btn small ghost yapmod-theme-tab-active",
        text: "Installed",
        attrs: { type: "button", role: "tab", "aria-selected": "true" },
        on: { click: () => setView("installed") },
      });

      const communityTab = createElement("button", {
        className: "btn small ghost",
        text: "Community",
        attrs: { type: "button", role: "tab", "aria-selected": "false" },
        on: { click: () => setView("community") },
      });

      tabs.append(installedTab, communityTab);

      const select = (theme: ThemeBundle | null): void => {
        store?.set("theme_id", theme?.id ?? "");
        themeApi?.apply(theme);
        renderGallery();
      };

      const removeTheme = async (theme: ThemeBundle): Promise<void> => {
        if (!(await confirmRemove(theme.name))) {
          return;
        }

        try {
          await themeApi?.remove(theme.id);

          if (activeId() === theme.id) {
            store?.set("theme_id", "");
            themeApi?.apply(null);
          }

          await refresh();
        } catch (error) {
          setStatus(String(error), true);
        }
      };

      const createCard = (
        theme: ThemeBundle | null,
        name: string,
        meta: string,
      ): HTMLElement => {
        const isActive = theme ? activeId() === theme.id : activeId() === "";

        const pick = createElement("button", {
          className: "yapmod-theme-card-pick",
          attrs: {
            type: "button",
            "aria-pressed": isActive ? "true" : "false",
          },
          children: [
            createPreview(theme),
            createElement("span", {
              className: "yapmod-theme-card-name",
              text: name,
            }),
          ],
          on: {
            click: () => {
              select(theme);
            },
          },
        });

        const foot = createElement("div", {
          className: "yapmod-theme-card-foot",
          children: [
            createElement("span", {
              className: "yapmod-theme-card-meta",
              text: meta,
            }),
          ],
        });

        if (theme) {
          foot.appendChild(
            createElement("button", {
              className: "yapmod-theme-remove",
              text: "×",
              attrs: {
                type: "button",
                "aria-label": `Remove the theme ${theme.name}`,
                title: `Remove ${theme.name}`,
              },
              on: {
                click: (event) => {
                  event.stopPropagation();
                  void removeTheme(theme);
                },
              },
            }),
          );
        }

        return createElement("div", {
          className: [
            "yapmod-theme-card",
            isActive ? "yapmod-theme-active" : "",
          ]
            .filter(Boolean)
            .join(" "),
          children: [pick, foot],
        });
      };

      const renderCommunity = (): void => {
        const query = searchQuery.trim().toLowerCase();
        const matches = communityThemes.filter((theme) => {
          if (!query) {
            return true;
          }

          return [theme.name, theme.author, theme.description, ...theme.tags]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(query));
        });

        if (matches.length === 0) {
          const message = communityThemes.length === 0
            ? "No community themes have been published yet. Check back later or submit a theme."
            : "No themes match your search.";
          communityGallery.replaceChildren(
            createElement("p", { className: "hint", text: message }),
          );
          return;
        }

        const installedIds = new Set(installedThemes.map((theme) => theme.id));
        const cards = matches.map((theme) => {
          const preview = theme.previewUrl
            ? createElement("span", {
                className: "yapmod-theme-preview",
                children: [
                  createElement("img", {
                    attrs: { src: theme.previewUrl, alt: `${theme.name} preview` },
                  }),
                ],
              })
            : createElement("span", {
                className: "yapmod-theme-preview",
                attrs: { "aria-hidden": "true" },
              });
          const details = createElement("div", {
            className: "yapmod-theme-card-info",
            children: [
              preview,
              createElement("span", {
                className: "yapmod-theme-card-name",
                text: theme.name,
              }),
              ...(theme.description
                ? [createElement("span", {
                    className: "yapmod-theme-card-description",
                    text: theme.description,
                  })]
                : []),
            ],
          });
          const meta = [theme.mode, theme.author, theme.version, theme.license]
            .filter(Boolean)
            .join(" · ");
          const isInstalled = installedIds.has(theme.id);
          const installButton = createElement("button", {
            className: "btn small yapmod-theme-install",
            text: isInstalled ? "Installed" : "Install",
            attrs: { type: "button" },
            props: { disabled: isInstalled },
            on: {
              click: () => {
                void installCommunityTheme(theme);
              },
            },
          });

          return createElement("div", {
            className: "yapmod-theme-card",
            children: [
              details,
              createElement("div", {
                className: "yapmod-theme-card-foot",
                children: [
                  createElement("span", {
                    className: "yapmod-theme-card-meta",
                    text: meta,
                  }),
                  installButton,
                ],
              }),
            ],
          });
        });

        communityGallery.replaceChildren(...cards);
      };

      const galleryItems = (): HTMLElement[] => {
        const items = [
          createCard(null, "Yapper's theme", "the look the app ships with"),
        ];

        for (const theme of installedThemes) {
          const meta = [theme.mode, theme.author, theme.version, theme.license]
            .filter(Boolean)
            .join(" · ");

          items.push(createCard(theme, theme.name, meta));
        }

        return items;
      };

      const renderGallery = (): void => {
        gallery.replaceChildren(...galleryItems());
        renderCommunity();
      };

      const refresh = async (): Promise<void> => {
        if (!themeApi) {
          return;
        }

        try {
          installedThemes = await themeApi.list();

          renderGallery();
        } catch (error) {
          setStatus(String(error), true);
        }
      };

      const loadCommunity = async (): Promise<void> => {
        if (!themeApi || communityLoading) {
          return;
        }

        communityLoading = true;
        setStatus("Loading community themes…");

        try {
          communityThemes = await themeApi.listCommunity();
          communityLoaded = true;
          setStatus(communityThemes.length === 0
            ? "No community themes are published yet."
            : `${communityThemes.length} community theme${communityThemes.length === 1 ? "" : "s"} available.`);
          renderCommunity();
        } catch (error) {
          setStatus(`Could not load community themes: ${String(error)}`, true);
        } finally {
          communityLoading = false;
        }
      };

      const installCommunityTheme = async (theme: CommunityTheme): Promise<void> => {
        try {
          setStatus(`Installing ${theme.name}…`);
          await themeApi?.installCommunity(theme.id);
          installedThemes = await themeApi?.list() ?? installedThemes;
          renderGallery();
          setStatus(`Installed ${theme.name}.`);
        } catch (error) {
          setStatus(String(error), true);
        }
      };

      function setView(view: "installed" | "community"): void {
        const installed = view === "installed";
        installedTab.classList.toggle("yapmod-theme-tab-active", installed);
        communityTab.classList.toggle("yapmod-theme-tab-active", !installed);
        installedTab.setAttribute("aria-selected", String(installed));
        communityTab.setAttribute("aria-selected", String(!installed));
        installedToolbar.hidden = !installed;
        communityToolbar.hidden = installed;
        gallery.hidden = !installed;
        communityGallery.hidden = installed;

        if (!installed && !communityLoaded) {
          void loadCommunity();
        } else if (!installed) {
          renderCommunity();
        }
      }

      const importTheme = async (): Promise<void> => {
        try {
          const source = await themeApi?.pickFolder();

          if (!source) {
            return;
          }

          setStatus("Installing…");

          const theme = await themeApi?.install(source);

          setStatus(`Installed ${theme?.name ?? "the theme"}.`);
          await refresh();
        } catch (error) {
          setStatus(String(error), true);
        }
      };

      const modeDropdown = createDropdown({
        id: `yapmod-${SECTION_ID}-theme-mode`,
        value: store?.get<string>("theme_mode", "system") ?? "system",
        options: [
          { value: "system", label: "Follow the system" },
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ],
        onChange: (value) => {
          store?.set("theme_mode", value);
        },
        ariaLabel: "Mode",
      });

      // The buttons live in the top right of the section.
      const installedToolbar = createElement("div", {
        className: "yapmod-theme-toolbar",
        children: [
          createElement("button", {
            className: "btn small",
            text: "Import theme",
            props: { type: "button" },
            on: {
              click: () => {
                void importTheme();
              },
            },
          }),
          createElement("button", {
            className: "btn small ghost",
            text: "Refresh",
            props: { type: "button" },
            on: {
              click: () => {
                void refresh();
              },
            },
          }),
          createElement("button", {
            className: "btn small ghost",
            text: "Open folder",
            props: { type: "button" },
            on: {
              click: () => {
                void themeApi?.openFolder();
              },
            },
          }),
        ],
      });

      const search = createElement("input", {
        className: "input yapmod-theme-search",
        attrs: {
          type: "search",
          placeholder: "Search community themes",
          "aria-label": "Search community themes",
        },
        on: {
          input: (event) => {
            searchQuery = (event.currentTarget as HTMLInputElement).value;
            renderCommunity();
          },
        },
      });

      const communityToolbar = createElement("div", {
        className: "yapmod-theme-community-toolbar",
        props: { hidden: true },
        children: [
          search,
          createElement("button", {
            className: "btn small ghost",
            text: "Refresh",
            attrs: { type: "button" },
            on: { click: () => void loadCommunity() },
          }),
          createElement("button", {
            className: "btn small",
            text: "Submit a theme",
            attrs: { type: "button" },
            on: {
              click: () => openExternally("https://ilyeshdz.github.io/yapmod/docs/community-themes/"),
            },
          }),
        ],
      });

      const modeField = createElement("div", {
        className: "field yapmod-theme-field",
        children: [
          createElement("label", {
            attrs: { for: `yapmod-${SECTION_ID}-theme-mode` },
            text: "Mode",
          }),
          modeDropdown.element,
          createElement("span", {
            className: "hint",
            text: "Used by themes that support both a light and a dark version.",
          }),
        ],
      });

      host.append(tabs, installedToolbar, communityToolbar, gallery, communityGallery, modeField, status);

      renderGallery();
      void refresh();

      const unsubscribe = themeApi?.onChange(() => {
        if (!cancelled) {
          renderGallery();
        }
      });

      return () => {
        cancelled = true;
        unsubscribe?.();
        modeDropdown.destroy();
      };
    },
  };
}

/**
 * Registers the theme section in the settings of the app.
 */
export function installThemeSettings(): void {
  const yapmod = getYapmod();

  if (!yapmod.settings) {
    return;
  }

  ensureStyle(UI_STYLE_ID, THEME_UI_CSS);

  yapmod.settings.register(createThemeSection());
}
