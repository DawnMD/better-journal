/**
 * Display formatting that renders identically on the server and in the browser.
 *
 * `toLocaleString()` / `toLocaleDateString(undefined, …)` resolve against the
 * *ambient* locale, and in a Next.js app that is two different things: the Node
 * process's ICU default during SSR, and the reader's browser setting during
 * hydration. When they disagree — a server defaulting to `en-IN` rendering
 * "31 Jul" / "1,23,456" against a browser on `en-US` rendering "Jul 31" /
 * "123,456" — React throws a hydration mismatch.
 *
 * So the locale is pinned rather than inferred. The document already commits to
 * one language (`<html lang="en">`) and there is no i18n layer, so deferring to
 * whatever ICU happens to pick was never buying anything.
 *
 * Same reasoning as `dayKeyInTimeZone`'s hardcoded `en-CA` in ./timezone — an
 * explicit locale is the only kind that is reproducible.
 */

import { resolveTimeZone } from "./timezone";

export const DISPLAY_LOCALE = "en-US";

/** `1234` → `"1,234"`, the same on both sides of hydration. */
export function formatNumber(value: number): string {
  return value.toLocaleString(DISPLAY_LOCALE);
}

/** `toLocaleDateString` with the locale pinned. */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString(DISPLAY_LOCALE, options);
}

/**
 * Timestamps carry a *zone* as well as a locale, and it has the same problem.
 *
 * `format()` from date-fns reads a `Date` through the ambient zone, which during
 * SSR is the Node process's — UTC on Vercel. A note written at 02:00 IST would
 * server-render as the previous day and then swap on hydration, which is both a
 * wrong first paint and a React mismatch. So the zone, like the locale, is an
 * argument rather than whatever the runtime happens to be set to. Callers get it
 * from `useTimeZone`, which answers with the browser's once mounted.
 *
 * Assembled from `formatToParts` rather than handed to `dateStyle`/`timeStyle`
 * because these two shapes are the ones the pages already show, and `en-US`'s
 * built-in styles are neither of them.
 */
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(
  date: Date,
  requested: string,
): Record<Intl.DateTimeFormatPartTypes, string> {
  // Resolved before it reaches Intl: an unknown zone throws `RangeError` from
  // the constructor, and a dateline is not worth blanking a page over.
  const timeZone = resolveTimeZone(requested);
  let formatter = zonedFormatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    zonedFormatters.set(timeZone, formatter);
  }

  const parts = {} as Record<Intl.DateTimeFormatPartTypes, string>;
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;

  return parts;
}

/** `"Sun 2 Aug 2026"` — the editor's dateline, in `timeZone`. */
export function formatDayInZone(date: Date, timeZone: string): string {
  const { weekday, day, month, year } = zonedParts(date, timeZone);
  return `${weekday} ${day} ${month} ${year}`;
}

/** `"2 Aug 2026 at 9:52 AM"` — a full timestamp, in `timeZone`. */
export function formatDateTimeInZone(date: Date, timeZone: string): string {
  const { day, month, year, hour, minute, dayPeriod } = zonedParts(
    date,
    timeZone,
  );
  return `${day} ${month} ${year} at ${hour}:${minute} ${dayPeriod}`;
}
