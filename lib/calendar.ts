/**
 * Calendar geometry, with no React in it.
 *
 * Everything the month calendar needs in order to agree on *which days are on
 * screen* lives here, because two callers have to compute it identically: the
 * server page, which prefetches the note range, and the client component, which
 * queries it. A range derived twice by two different code paths is a guaranteed
 * cache miss on first paint.
 *
 * Deliberately free of `@date-fns/tz`. Nothing here decides which calendar day a
 * *note* belongs to — that is the server's job, in the reader's zone, via
 * `zonedDayAndMinutes`. These functions only lay out a grid, so plain local-date
 * arithmetic is the right tool and keeps the tz database out of this bundle.
 */

import {
  addDays,
  addMonths,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const DAY_KEY = "yyyy-MM-dd";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sunday, matching the month picker this replaced. */
const WEEK_STARTS_ON = 0 as const;

/**
 * Month grids are always six weeks tall.
 *
 * A grid that grew and shrank with the month would jump the whole page by a row
 * whenever you paged from February to March. Six is the tallest a month can be,
 * so it is the only height that never moves.
 */
const MONTH_WEEKS = 6;

/**
 * Narrows an untrusted `?date=` value to a real `yyyy-MM-dd`, or `fallback`.
 *
 * Both the shape and the *date* are checked: `parseISO` accepts far more than
 * this format and returns an Invalid Date for the rest, which every `format`
 * call downstream then throws on. That is a 500 on the server page and an error
 * boundary in the browser — for a mistyped query string in a shared link, which
 * should just open on today instead.
 */
export function resolveDayKey(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !ISO_DATE.test(value)) return fallback;

  // Catches the well-formed impossibilities the regex cannot — "2026-02-31",
  // "2026-13-01" — which parse to an Invalid Date rather than being rejected.
  return isValid(parseISO(value)) ? value : fallback;
}

/** Every day the month grid around `anchor` draws, in order: always 42. */
export function visibleDays(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor), {
    weekStartsOn: WEEK_STARTS_ON,
  });

  return Array.from({ length: MONTH_WEEKS * 7 }, (_, index) =>
    addDays(first, index),
  );
}

/**
 * The inclusive `yyyy-MM-dd` bounds of the month grid — the shape the range
 * query takes as input.
 */
export function rangeKeys(anchor: Date): { start: string; end: string } {
  const days = visibleDays(anchor);

  return {
    start: format(days[0]!, DAY_KEY),
    end: format(days[days.length - 1]!, DAY_KEY),
  };
}

/** One month forward (`+1`) or back (`-1`). */
export function shiftMonth(anchor: Date, direction: 1 | -1): Date {
  return addMonths(anchor, direction);
}

/** The heading above the grid: "July 2026". */
export function monthTitle(anchor: Date): string {
  return format(anchor, "MMMM yyyy");
}
