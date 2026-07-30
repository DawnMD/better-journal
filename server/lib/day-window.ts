import { resolveTimeZone } from "@/lib/timezone";
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths } from "date-fns";

/**
 * Day-boundary arithmetic, in one place.
 *
 * `Note.createdAt` is a Postgres `TIMESTAMP(3)` — timezone-naive, holding UTC.
 * UTC is therefore the single source of truth for *storage*. But "which day did
 * I write this on" is a question about the *reader's* calendar, not the
 * server's: a note written at 02:00 IST on Jul 30 is stored as 20:30 UTC on
 * Jul 29, and bucketing it in the server's zone (UTC on Vercel) files it under
 * the wrong day.
 *
 * So the zone is an explicit input, supplied by the client, and every day
 * boundary is computed here. Nothing downstream calls `startOfDay` on a bare
 * `Date`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export type Window = { start: Date; end: Date };

/**
 * The half-open UTC instant range `[start, end)` covering the calendar day
 * `dateISO` (`yyyy-MM-dd`) as it is lived in `timeZone`.
 *
 * Half-open on purpose: an inclusive end would need millisecond fudging and
 * would double-count a note written exactly at midnight.
 */
export function dayWindow(dateISO: string, timeZone: string): Window {
  if (!ISO_DATE.test(dateISO)) {
    throw new Error(`Expected a yyyy-MM-dd date, received "${dateISO}"`);
  }

  const zone = resolveTimeZone(timeZone);
  const [year, month, day] = dateISO.split("-").map(Number);

  // TZDate fixes the wall-clock reading to `zone`; date-fns v4 then does its
  // arithmetic in that zone, so `addDays` lands on the next local midnight even
  // across a DST transition, where the day is 23 or 25 hours long.
  const start = new TZDate(year, month - 1, day, 0, 0, 0, 0, zone);
  const end = addDays(start, 1);

  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/**
 * The UTC instant range covering the calendar month `monthISO` (`yyyy-MM`) in
 * `timeZone`. Bounds the calendar-badge query to the month actually on screen.
 */
export function monthWindow(monthISO: string, timeZone: string): Window {
  if (!ISO_MONTH.test(monthISO)) {
    throw new Error(`Expected a yyyy-MM month, received "${monthISO}"`);
  }

  const zone = resolveTimeZone(timeZone);
  const [year, month] = monthISO.split("-").map(Number);

  const start = new TZDate(year, month - 1, 1, 0, 0, 0, 0, zone);
  const end = addMonths(start, 1);

  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** The UTC instant range covering `year` in `timeZone`. Used by the activity heatmap. */
export function yearWindow(year: number, timeZone: string): Window {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new Error(`Expected a four-digit year, received "${year}"`);
  }

  const zone = resolveTimeZone(timeZone);

  const start = new TZDate(year, 0, 1, 0, 0, 0, 0, zone);
  const end = new TZDate(year + 1, 0, 1, 0, 0, 0, 0, zone);

  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}
