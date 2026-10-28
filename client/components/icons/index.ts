/** SVG path data for reusable icon shapes. */

import { check } from "./check";
import { close } from "./close";
import { code } from "./code";
import { copy } from "./copy";
import { dock } from "./dock";
import { float } from "./float";
import { history } from "./history";
import { monitor } from "./monitor";
import { palette } from "./palette";
import { plus } from "./plus";
import { puzzle } from "./puzzle";
import { refresh } from "./refresh";
import { save } from "./save";
import { search } from "./search";
import { settings } from "./settings";
import { trash } from "./trash";

export {
  check,
  close,
  code,
  copy,
  dock,
  float,
  history,
  monitor,
  palette,
  plus,
  puzzle,
  refresh,
  save,
  search,
  settings,
  trash,
};

export const iconPaths = {
  monitor,
  palette,
  history,
  puzzle,
  code,
  save,
  trash,
  float,
  dock,
  close,
  check,
  copy,
  refresh,
  plus,
  search,
  settings,
} as const;

/** All available icon names. */
export type IconName = keyof typeof iconPaths;
