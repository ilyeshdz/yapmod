import type { SettingsSection } from "../types";
import type { CommunityTheme, ThemeBundle } from "./types";
import { createElement, ensureStyle } from "../ui";
import { createDropdown } from "../dropdown";
import { getYapmod } from "../../core/scope";
import { openExternally } from "../../core/links";
import { confirmRemove, createPreview } from "./picker-preview";
import themeCSS from "../../styles/themes.css";

const SECTION_ID = "yapmod-themes";

/**
 * The section sits in the group of the client, right under its own item.
 */
const GROUP_LABEL = "Yapmod";
const UI_STYLE_ID = "yapmod-theme-ui-styles";

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
              click: () => openExternally("https://ilyeshdz.github.io/yapmod/docs/submit-a-theme/"),
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

  ensureStyle(UI_STYLE_ID, themeCSS);

  yapmod.settings.register(createThemeSection());
}
