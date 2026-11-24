import {
  dayKeyInTimeZone,
  resolveTimeZone,
  TZ_COOKIE,
  zonedDayAndMinutes,
} from "@/lib/reader-calendar-core";
import { Prisma } from "@/prisma/generated/prisma/client";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { cookies } from "next/headers";
import z from "zod";

/**
 * The reader calendar: every "which day is this" question, answered in the
 * reader zone.
 *
 * `Note.createdAt` is a Postgres `TIMESTAMP(3)` — timezone-naive, holding UTC.
 * UTC is therefore the single source of truth for *storage*. But "which day did
 * I write this on" is a question about the *reader's calendar day*, not the
 * server's: a note written at 02:00 IST on Jul 30 is stored as 20:30 UTC on
 * Jul 29, and bucketing it in the server's zone (UTC on Vercel) files it under
 * the wrong day.
 *
 * So the reader zone is a procedure input (ADR-0002), parsed once by
 * `readerZoneInput` into a reader calendar, and every day boundary is computed
 * here. Nothing downstream calls `startOfDay` on a bare `Date` or resolves the
 * zone itself.
 *
 * Server-only (ADR-0001): the day-boundary arithmetic needs `@date-fns/tz`, and
 * the tz database must not reach the browser bundle. The Intl-only shared core
 * the client also uses lives in `lib/reader-calendar-core.ts`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Window = { start: Date; end: Date };

/**
 * The widest span `rangeWindow` will serve.
 *
 * Six weeks — the tallest month grid the calendar draws. The bound is what keeps
 * the range query's cost fixed: without it, a caller could ask one procedure for
 * every note a journal has ever held, which is the unbounded read the per-month
 * aggregation was introduced to remove.
 */
export const MAX_RANGE_DAYS = 42;

export type ReaderCalendar = {
  /** The resolved reader zone — UTC when the input was missing or unknown. */
  readonly zone: string;

  /**
   * The half-open UTC instant range `[start, end)` covering the calendar day
   * `day` (`yyyy-MM-dd`) as it is lived in the reader zone.
   *
   * Half-open on purpose: an inclusive end would need millisecond fudging and
   * would double-count a note written exactly at midnight.
   */
  dayWindow(day: string): Window;

  /**
   * The UTC instant range covering the days `from`..`to` *inclusive*, capped at
   * `MAX_RANGE_DAYS`.
   *
   * Inclusive at both ends because that is how a calendar states its own extent —
   * "Jun 28 through Aug 8" is one visible month grid. The instants are still
   * half-open, for the same reason `dayWindow`'s are.
   */
  rangeWindow(from: string, to: string): Window;

  /** The UTC instant range covering `year`. Used by the activity heatmap. */
  yearWindow(year: number): Window;

  /** The reader's calendar day (`yyyy-MM-dd`) on which `instant` falls. */
  dayOf(instant: Date): string;

  /**
   * Which day `instant` falls on and how many minutes into it — what the
   * calendar's time grid needs to place a note.
   */
  dayAndMinutesOf(instant: Date): { day: string; minutes: number };

  /** The reader's calendar day at `now`. */
  today(now?: Date): string;

  /**
   * SQL for the reader's calendar day (a Postgres `date`) on which the stored
   * instant `column` falls — the in-database twin of `dayOf`, for aggregates
   * that bucket by day.
   *
   * Timestamps are stored as `TIMESTAMP(3)` holding UTC, so the value is first
   * labelled as UTC and then converted: `AT TIME ZONE 'UTC' AT TIME ZONE zone`.
   * A single `AT TIME ZONE` would read the naive value as though it were
   * already local and shift it the wrong way. The zone is a bind parameter.
   */
  daySql(column: Prisma.Sql): Prisma.Sql;
};

/** Builds the reader calendar for `timeZone`, falling back to UTC. */
export function readerCalendar(timeZone: string | undefined | null): ReaderCalendar {
  const zone = resolveTimeZone(timeZone);

  // TZDate fixes the wall-clock reading to `zone`; date-fns v4 then does its
  // arithmetic in that zone, so `addDays` lands on the next local midnight even
  // across a DST transition, where the day is 23 or 25 hours long.
  const localMidnight = (year: number, monthIndex: number, day: number) =>
    new TZDate(year, monthIndex, day, 0, 0, 0, 0, zone);

  const instants = (start: Date, end: Date): Window => ({
    start: new Date(start.getTime()),
    end: new Date(end.getTime()),
  });

  const dayWindow = (day: string): Window => {
    if (!ISO_DATE.test(day)) {
      throw new Error(`Expected a yyyy-MM-dd date, received "${day}"`);
    }

    const [year, month, date] = day.split("-").map(Number);
    const start = localMidnight(year, month - 1, date);

    return instants(start, addDays(start, 1));
  };

  return {
    zone,

    dayWindow,

    rangeWindow(from, to) {
      const { start } = dayWindow(from);
      const { end } = dayWindow(to);

      if (end <= start) {
        throw new Error(`Range "${from}".."${to}" ends before it starts`);
      }

      // Rounded, not floored: a span containing a DST transition is a whole
      // number of days plus or minus an hour, and flooring would let a 42-day
      // grid that crosses one measure 41.96 days on one side of the year and
      // 42.04 on the other. Rounding gives the same answer either way.
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);

      if (days > MAX_RANGE_DAYS) {
        throw new Error(
          `Range "${from}".."${to}" spans ${days} days, over the ${MAX_RANGE_DAYS}-day limit`,
        );
      }

      return { start, end };
    },

    yearWindow(year) {
      if (!Number.isInteger(year) || year < 1970 || year > 9999) {
        throw new Error(`Expected a four-digit year, received "${year}"`);
      }

      return instants(localMidnight(year, 0, 1), localMidnight(year + 1, 0, 1));
    },

    dayOf: (instant) => dayKeyInTimeZone(instant, zone),

    dayAndMinutesOf: (instant) => zonedDayAndMinutes(instant, zone),

    today: (now = new Date()) => dayKeyInTimeZone(now, zone),

    daySql: (column) =>
      Prisma.sql`((${column} AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date)`,
  };
}

/**
 * The reader calendar as a server page can best know it: in the zone from the
 * `tz` cookie (written by `ReaderZoneCookieSync`), UTC without one.
 *
 * Used to seed a page's `ReaderZoneProvider` and to key its prefetches on the
 * zone the client will use. On a visitor's very first request the cookie does
 * not exist yet, so the prefetch keys on UTC, misses, and the client fetches
 * once; every later navigation hits. Correctness never depends on it — the
 * authoritative zone is the one the client sends as a procedure input
 * (ADR-0002).
 */
export async function readerCalendarFromCookie(): Promise<ReaderCalendar> {
  const store = await cookies();
  return readerCalendar(store.get(TZ_COOKIE)?.value);
}

/**
 * The one input schema for the reader zone. Procedures that bucket by day take
 * `timeZone: readerZoneInput` and receive a ready reader calendar; the client
 * still sends a plain IANA string (or nothing).
 */
export const readerZoneInput = z
  .string()
  .optional()
  .transform((timeZone) => readerCalendar(timeZone));
