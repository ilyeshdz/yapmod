import type {
  CommunityPlugin,
  PluginBundle,
  PluginManifest,
} from "../../shared/types";
import type { PluginRepository } from "../../platform/host";

/**
 * The package-facing half of the plugin API.
 *
 * A target decides whether plugins exist and where packages are stored. The
 * activation engine only sees this repository.
 */
export type YapmodPluginRepositoryApi = {
  list(): Promise<PluginBundle[]>;
  listCommunity(): Promise<CommunityPlugin[]>;
  previewCommunity(id: string): Promise<PluginManifest>;
  installCommunity(
    id: string,
    expectedManifest: PluginManifest,
  ): Promise<PluginBundle>;
  pickFolder(): Promise<PluginManifest | null>;
  installPicked(expectedManifest: PluginManifest): Promise<PluginBundle>;
  pickFile(accept: string | null | undefined): Promise<string | null>;
  remove(id: string): Promise<void>;
  openFolder(): Promise<void>;
};

export function createPluginRepository(
  port: PluginRepository | undefined,
): YapmodPluginRepositoryApi {
  function repository(): PluginRepository {
    if (!port) {
      throw new Error("[yapmod] this target has no plugin repository");
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

    previewCommunity(id) {
      return repository().previewCommunity(id);
    },

    installCommunity(id, expectedManifest) {
      return repository().installCommunity(id, expectedManifest);
    },

    pickFolder() {
      return port?.pickFolder() ?? Promise.resolve(null);
    },

    installPicked(expectedManifest) {
      return repository().installPicked(expectedManifest);
    },

    pickFile(accept) {
      return port?.pickFile(accept) ?? Promise.resolve(null);
    },

    remove(id) {
      return repository().remove(id);
    },

    openFolder() {
      return port?.openFolder() ?? Promise.resolve();
    },
  };
}
