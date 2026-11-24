import { readerCalendar, type Window } from "./reader-calendar";

/**
 * Zone-per-call wrappers over the reader calendar, kept only for the procedures
 * that do not yet take `readerZoneInput` (stats). New code builds a reader
 * calendar instead; see `server/lib/reader-calendar.ts`.
 */

export { MAX_RANGE_DAYS, type Window } from "./reader-calendar";

export function dayWindow(dateISO: string, timeZone: string): Window {
  return readerCalendar(timeZone).dayWindow(dateISO);
}

export function yearWindow(year: number, timeZone: string): Window {
  return readerCalendar(timeZone).yearWindow(year);
}
