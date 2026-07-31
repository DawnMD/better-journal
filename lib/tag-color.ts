/**
 * A stable colour per tag, derived from its name rather than stored.
 *
 * Deliberately *not* the viz tokens. `--viz-level-0..4` (see
 * components/dashboard/viz-tokens.tsx and the notes beside them in
 * app/globals.css) are a sequential single-hue blue ramp, tuned so that further
 * from the background reads as "more of something". Tags are categorical: there
 * is no sense in which "work" is more than "recipes", and borrowing the ramp
 * would assert exactly that. `--chart-1..5` are greyscale in this theme, so they
 * cannot distinguish categories at all. Hence a separate eight-hue set.
 *
 * Eight, not more: past roughly this many, adjacent hues stop being reliably
 * tellable apart, and the name is right there anyway. Colour is never the only
 * signal here — chips always render their name, and dots carry a title and an
 * aria-label.
 *
 * Derived, not a column, because the alternative is a `color` field that has to
 * be picked at creation time (tags are created implicitly by `connectOrCreate`,
 * so there is nobody to pick), backfilled, and kept unique-ish by hand.
 */

import { normalizeTagName } from "@/lib/tags";

/**
 * Complete class strings, one per hue.
 *
 * Written out in full because Tailwind v4 scans source text: `bg-${hue}-500/10`
 * generates nothing, since the scanner never sees the assembled name.
 *
 * One array serves both themes. The fill and border are the same hue at low
 * alpha, which composites acceptably over any surface in the app, so only the
 * text lightness has to swap at `dark:`.
 */
const TAG_COLORS = [
  "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300",
  "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "border-lime-500/30 bg-lime-500/10 text-lime-800 dark:text-lime-300",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
  "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
] as const;

/** Matching solid fills, for the month grid's dots. */
const TAG_DOT_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
] as const;

export const TAG_COLOR_COUNT = TAG_COLORS.length;

/**
 * FNV-1a, 32-bit.
 *
 * Chosen for being short enough to read and stable forever — the colours are
 * part of the UI's identity, so the mapping must not drift between releases.
 * `Math.imul` keeps the multiply in 32-bit range instead of silently going
 * through a float, and `>>> 0` makes the result unsigned so the modulo below
 * cannot come back negative.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Which of the eight hues a tag gets, in `[0, TAG_COLOR_COUNT)`.
 *
 * Hashed over the *normalised* name, so "Work" and "work" — which are one tag
 * as far as the database is concerned — cannot render in two different colours
 * if some caller skipped normalisation.
 */
export function tagColorIndex(name: string): number {
  return fnv1a(normalizeTagName(name)) % TAG_COLOR_COUNT;
}

/** Border, fill and text for a tag chip. */
export function tagColorClasses(name: string): string {
  return TAG_COLORS[tagColorIndex(name)]!;
}

/** The solid fill for a tag dot. */
export function tagDotClasses(name: string): string {
  return TAG_DOT_COLORS[tagColorIndex(name)]!;
}
