import type { ThemeBundle } from "./types";
import {
  installThemeEngine,
  type YapmodThemeEngineApi,
} from "./engine";
import {
  createThemeRepository,
  type YapmodThemeRepositoryApi,
} from "./repository";
import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";

/**
 * The theme API exposed to Yapin and plugins.
 *
 * The engine and the repository stay separate modules; this facade keeps the
 * public shape stable for callers that use both.
 */
export type YapmodThemeApi = YapmodThemeEngineApi &
  YapmodThemeRepositoryApi;

export function installThemeApi(theme: ThemeBundle | null): YapmodThemeApi {
  const engine = installThemeEngine(theme);
  const repository = createThemeRepository(getHost().themes);

  const api: YapmodThemeApi = {
    get active(): ThemeBundle | null {
      return engine.active;
    },

    apply: engine.apply,
    onChange: engine.onChange,
    ...repository,
  };

  getYapmod().theme = api;

  return api;
}
