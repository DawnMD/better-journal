import { Prisma } from "@/prisma/generated/prisma/client";
import z from "zod";
import { countLiveJournals } from "../lib/journal-access";
import { ownedNoteSql } from "../lib/note-access";
import { readerZoneInput } from "../lib/reader-calendar";
import { protectedProcedure } from "../orpc";

/**
 * Dashboard statistics.
 *
 * Every procedure here aggregates in Postgres and returns a fixed-size result.
 * Nothing loads note rows into JavaScript to count them — that was the bug in the
 * old calendar badges, and it is the one that gets worse the more someone uses the
 * app.
 *
 * All of it is bucketed on the reader's calendar day: each procedure takes the
 * reader zone as `readerZoneInput` (ADR-0002) and buckets with the reader
 * calendar's `daySql`, so the day a note is counted on here is the day the
 * journal calendar files it under. "Today" comes from the reader calendar too,
 * never from the database session's zone.
 *
 * Every query is a tagged `$queryRaw`, so every interpolated value — user id,
 * zone, dates — is a bind parameter. Which notes count is note access's rule
 * (`ownedNoteSql`), not a clause restated here.
 *
 * Password-protected journals ARE counted. These are pure aggregates — a count, a
 * streak, a word total — that never name a journal or expose a line of text, so
 * including them leaks nothing a locked journal is protecting, while excluding them
 * would silently make the user's own totals wrong. Anything that names a journal or
 * shows its content (search, note lists) still excludes them.
 */

/** Notes the caller may count — owned notes of live journals — aliased `n`. */
function countedNotes(userId: string) {
  return Prisma.sql`"Note" n WHERE ${ownedNoteSql(userId, Prisma.raw(`n."journalId"`))}`;
}

const createdAt = Prisma.raw(`n."createdAt"`);

/**
 * Word count for a note, in SQL.
 *
 * The `~ '\S'` guard matters: `regexp_split_to_array('', '\s+')` returns `{''}`,
 * whose length is 1, so an empty note would otherwise count as one word.
 */
const WORDS = Prisma.raw(`
  CASE WHEN coalesce(n."plainText", '') ~ '\\S'
    THEN array_length(regexp_split_to_array(btrim(n."plainText"), '\\s+'), 1)
    ELSE 0
  END
`);

export const statsRouter = {
  /** Journals, notes, words and distinct days written — the stat-tile row. */
  getTotals: protectedProcedure
    .input(z.object({ timeZone: readerZoneInput }))
    .handler(async ({ context, input: { timeZone: calendar } }) => {
      const [journals, [row]] = await Promise.all([
        countLiveJournals(context),
        context.db.$queryRaw<
          {
            notes: number;
            words: number;
            daysActive: number;
            firstEntry: Date | null;
          }[]
        >`
          SELECT
            COUNT(n."id")::int AS "notes",
            COALESCE(SUM(${WORDS}), 0)::int AS "words",
            COUNT(DISTINCT ${calendar.daySql(createdAt)})::int AS "daysActive",
            MIN(n."createdAt") AS "firstEntry"
          FROM ${countedNotes(context.userId)}
        `,
      ]);

      return {
        journals,
        notes: row?.notes ?? 0,
        words: row?.words ?? 0,
        daysActive: row?.daysActive ?? 0,
        firstEntry: row?.firstEntry ?? null,
      };
    }),
  /**
   * Current and longest consecutive-day writing streak.
   *
   * Solved in SQL with the gaps-and-islands trick: for a set of consecutive dates,
   * `date - row_number()` is constant, so grouping by that difference collapses each
   * unbroken run into one row. Doing this in JavaScript would mean shipping every
   * distinct day to the client.
   *
   * "Current" allows the run to end yesterday as well as today, so the streak does
   * not appear broken first thing in the morning before you have written.
   */
  getStreak: protectedProcedure
    .input(z.object({ timeZone: readerZoneInput }))
    .handler(async ({ context, input: { timeZone: calendar } }) => {
      const [row] = await context.db.$queryRaw<
        { current: number; longest: number }[]
      >`
        WITH days AS (
          SELECT DISTINCT ${calendar.daySql(createdAt)} AS d
          FROM ${countedNotes(context.userId)}
        ),
        islands AS (
          SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS island
          FROM days
        ),
        runs AS (
          SELECT COUNT(*)::int AS len, MAX(d) AS ended
          FROM islands
          GROUP BY island
        )
        SELECT
          COALESCE((
            SELECT r.len FROM runs r
            WHERE r.ended >= ${calendar.today()}::date - 1
            ORDER BY r.ended DESC
            LIMIT 1
          ), 0) AS "current",
          COALESCE((SELECT MAX(len) FROM runs), 0) AS "longest"
      `;

      return row ?? { current: 0, longest: 0 };
    }),
  /**
   * Daily note counts for the contribution heatmap, for one year.
   *
   * Returned as a `yyyy-MM-dd → count` lookup so the grid can index directly rather
   * than scanning an array per cell.
   */
  getActivity: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(1970).max(9999),
        timeZone: readerZoneInput,
      }),
    )
    .handler(async ({ context, input: { year, timeZone: calendar } }) => {
      const { start, end } = calendar.yearWindow(year);

      const rows = await context.db.$queryRaw<
        { day: string; count: number; words: number }[]
      >`
        SELECT
          to_char(${calendar.daySql(createdAt)}, 'YYYY-MM-DD') AS "day",
          COUNT(*)::int AS "count",
          COALESCE(SUM(${WORDS}), 0)::int AS "words"
        FROM ${countedNotes(context.userId)}
          AND n."createdAt" >= ${start}
          AND n."createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1
      `;

      const byDay: Record<string, { count: number; words: number }> = {};
      for (const row of rows) {
        byDay[row.day] = { count: row.count, words: row.words };
      }

      return { year, byDay };
    }),
  /**
   * Words written per bucket over a trailing range, for the line chart.
   *
   * `generate_series` supplies the calendar so quiet periods come back as explicit
   * zeroes. Without it the line would join across gaps and imply continuous writing
   * through a week that was actually empty.
   */
  getWordCounts: protectedProcedure
    .input(
      z.object({
        range: z.enum(["30d", "90d", "12m"]).default("90d"),
        timeZone: readerZoneInput,
      }),
    )
    .handler(async ({ context, input: { range, timeZone: calendar } }) => {
      // Daily for the short ranges; monthly for a year, where 365 daily points
      // would be noise rather than a trend.
      const bucket = range === "12m" ? "month" : "day";
      const interval = { "30d": "29 days", "90d": "89 days", "12m": "11 months" }[
        range
      ];
      const format = bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD";

      // Plain `timestamp` on both sides: `date_trunc` on a bare `date` would cast
      // it to `timestamptz` and truncate in the database session's zone instead.
      const lastBucket = Prisma.sql`date_trunc(${bucket}, ${calendar.today()}::date::timestamp)`;

      const rows = await context.db.$queryRaw<
        { bucket: string; words: number; notes: number }[]
      >`
        WITH calendar AS (
          SELECT generate_series(
            ${lastBucket} - ${interval}::interval,
            ${lastBucket},
            ('1 ' || ${bucket})::interval
          ) AS bucket
        ),
        entries AS (
          SELECT
            date_trunc(${bucket}, ${calendar.daySql(createdAt)}::timestamp) AS bucket,
            ${WORDS} AS words
          FROM ${countedNotes(context.userId)}
        )
        SELECT
          to_char(c.bucket, ${format}) AS "bucket",
          COALESCE(SUM(e.words), 0)::int AS "words",
          COUNT(e.words)::int AS "notes"
        FROM calendar c
        LEFT JOIN entries e ON e.bucket = c.bucket
        GROUP BY c.bucket
        ORDER BY c.bucket
      `;

      return { range, bucket, points: rows };
    }),
};
