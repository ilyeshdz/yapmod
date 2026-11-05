import type { CommunityTheme, ThemeBundle } from "./types";
import type { ThemeRepository } from "../../platform/host";

/**
 * The package-facing half of the theme API.
 *
 * A target decides where themes live: a filesystem folder on desktop, extension
 * storage in the browser. The renderer never sees that choice.
 */
export type YapmodThemeRepositoryApi = {
  list(): Promise<ThemeBundle[]>;
  listCommunity(): Promise<CommunityTheme[]>;
  pickFolder(): Promise<string | null>;
  install(source: string): Promise<ThemeBundle>;
  installCommunity(id: string): Promise<ThemeBundle>;
  reload(id: string): Promise<ThemeBundle>;
  remove(id: string): Promise<void>;
  folder(): Promise<string>;
  openFolder(): Promise<void>;
};

export function createThemeRepository(
  port: ThemeRepository | undefined,
): YapmodThemeRepositoryApi {
  function repository(): ThemeRepository {
    if (!port) {
      throw new Error("[yapmod] this target has no theme repository");
    }

    return port;
  }

  return {
    list() {
      return port?.list() ?? Promise.resolve([]);
    },

    listCommunity() {
      return port?.listCommunity() ?? Promise.resolve([]);
    },

    pickFolder() {
      return port?.pickFolder() ?? Promise.resolve(null);
    },

    install(source) {
      return repository().install(source);
    },

    installCommunity(id) {
      return repository().installCommunity(id);
    },

    reload(id) {
      return repository().reload(id);
    },

    remove(id) {
      return repository().remove(id);
    },

    folder() {
      return repository().folder();
    },

    openFolder() {
      return port?.openFolder() ?? Promise.resolve();
    },
  };
}
