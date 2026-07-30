/**
 * Chart color helpers.
 *
 * The token *values* live in `app/globals.css` alongside the rest of the theme —
 * see the comment there for the validator runs that justify each step. This module
 * only holds the binning logic and the CSS-variable names the charts reference.
 */

/**
 * Bin a day's note count to one of the five ramp steps.
 *
 * Five bins, not a continuous mapping: past roughly seven classes adjacent shades
 * stop being tellable apart, so finer gradations would imply a precision the eye
 * cannot read. The exact count is in the tooltip and the table view.
 */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export const LEVEL_VAR = [
  "var(--viz-level-0)",
  "var(--viz-level-1)",
  "var(--viz-level-2)",
  "var(--viz-level-3)",
  "var(--viz-level-4)",
] as const;
