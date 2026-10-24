import type { YapmodGlobal, YapmodScope } from "../shared/types";

/**
 * The scope the injected code runs in.
 */
export function getScope(): YapmodScope {
  return globalThis as YapmodScope;
}

/**
 * The API of yapmod.
 *
 * The object is created on the first call, so the preinject bundle can
 * fill it in and every module reaches it the same way.
 */
export function getYapmod(): YapmodGlobal {
  const scope = getScope();

  scope.__yapmod ??= {};

  return scope.__yapmod;
}
