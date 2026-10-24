/** SVG path data for reusable icon shapes. */

import { monitor } from "./monitor";
import { palette } from "./palette";
import { history } from "./history";
import { puzzle } from "./puzzle";

export { monitor, palette, history, puzzle };

export const iconPaths = {
  monitor,
  palette,
  history,
  puzzle,
} as const;

/** All available icon names. */
export type IconName = keyof typeof iconPaths;
