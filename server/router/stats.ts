import { resolveTimeZone } from "@/lib/timezone";
import z from "zod";
import { yearWindow } from "../lib/day-window";
import { protectedProcedure } from "../orpc";

/**
 * Dashboard statistics.
 *
 * Every procedure here aggregates in Postgres and returns a fixed-size result.
 * Nothing loads note rows into JavaScript to count them — that was the bug in the
 * old calendar badges, and it is the one that gets worse the more someone uses the
 * app.
 *
 * All of it is bucketed in the reader's timezone. `createdAt` is `TIMESTAMP(3)`
 * holding UTC, so the conversion is always
 * `AT TIME ZONE 'UTC' AT TIME ZONE $tz` — labelling the naive value as UTC first,
 * then converting. A single `AT TIME ZONE` would read the stored value as though it
 * were already local and shift it the wrong way.
 *
 * Password-protected journals ARE counted. These are pure aggregates — a count, a
 * streak, a word total — that never name a journal or expose a line of text, so
 * including them leaks nothing a locked journal is protecting, while excluding them
 * would silently make the user's own totals wrong. Anything that names a journal or
 * shows its content (search, note lists) still excludes them.
 */

const timeZoneInput = z.string().optional();

/**
 * Word count for a note, in SQL.
 *
 * The `~ '\S'` guard matters: `regexp_split_to_array('', '\s+')` returns `{''}`,
 * whose length is 1, so an empty note would otherwise count as one word.
 */
const WORDS = `
  CASE WHEN coalesce(n."plainText", '') ~ '\\S'
    THEN array_length(regexp_split_to_array(btrim(n."plainText"), '\\s+'), 1)
    ELSE 0
  END
`;

export const statsRouter = {
  /** Journals, notes, words and distinct days written — the stat-tile row. */
  getTotals: protectedProcedure
    .input(z.object({ timeZone: timeZoneInput }))
    .handler(async ({ context, input }) => {
      const zone = resolveTimeZone(input.timeZone);

      const [row] = await context.db.$queryRawUnsafe<
        {
          journals: number;
          notes: number;
          words: number;
          daysActive: number;
          firstEntry: Date | null;
        }[]
      >(
        `
        SELECT
          (SELECT COUNT(*)::int FROM "Journal" WHERE "userId" = $1 AND "trash" = false) AS "journals",
          COUNT(n."id")::int AS "notes",
          COALESCE(SUM(${WORDS}), 0)::int AS "words",
          COUNT(DISTINCT (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $2)::date)::int AS "daysActive",
          MIN(n."createdAt") AS "firstEntry"
        FROM "Note" n
        JOIN "Journal" j ON j."id" = n."journalId"
        WHERE j."userId" = $1 AND j."trash" = false
        `,
        context.userId,
        zone,
      );

      return (
        row ?? {
          journals: 0,
          notes: 0,
          words: 0,
          daysActive: 0,
          firstEntry: null,
        }
      );
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
    .input(z.object({ timeZone: timeZoneInput }))
    .handler(async ({ context, input }) => {
      const zone = resolveTimeZone(input.timeZone);

      const [row] = await context.db.$queryRawUnsafe<
        { current: number; longest: number }[]
      >(
        `
        WITH days AS (
          SELECT DISTINCT (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $2)::date AS d
          FROM "Note" n
          JOIN "Journal" j ON j."id" = n."journalId"
          WHERE j."userId" = $1 AND j."trash" = false
        ),
        islands AS (
          SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS island
          FROM days
        ),
        runs AS (
          SELECT COUNT(*)::int AS len, MAX(d) AS ended
          FROM islands
          GROUP BY island
        ),
        today AS (SELECT (now() AT TIME ZONE $2)::date AS d)
        SELECT
          COALESCE((
            SELECT r.len FROM runs r, today t
            WHERE r.ended >= t.d - 1
            ORDER BY r.ended DESC
            LIMIT 1
          ), 0) AS "current",
          COALESCE((SELECT MAX(len) FROM runs), 0) AS "longest"
        `,
        context.userId,
        zone,
      );

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
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      const zone = resolveTimeZone(input.timeZone);
      const { start, end } = yearWindow(input.year, zone);

      const rows = await context.db.$queryRawUnsafe<
        { day: string; count: number; words: number }[]
      >(
        `
        SELECT
          to_char((n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS "day",
          COUNT(*)::int AS "count",
          COALESCE(SUM(${WORDS}), 0)::int AS "words"
        FROM "Note" n
        JOIN "Journal" j ON j."id" = n."journalId"
        WHERE j."userId" = $1
          AND j."trash" = false
          AND n."createdAt" >= $3
          AND n."createdAt" < $4
        GROUP BY 1
        ORDER BY 1
        `,
        context.userId,
        zone,
        start,
        end,
      );

      const byDay: Record<string, { count: number; words: number }> = {};
      for (const row of rows) {
        byDay[row.day] = { count: row.count, words: row.words };
      }

      return { year: input.year, byDay };
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
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      const zone = resolveTimeZone(input.timeZone);

      // Daily for the short ranges; monthly for a year, where 365 daily points
      // would be noise rather than a trend.
      const bucket = input.range === "12m" ? "month" : "day";
      const interval = { "30d": "29 days", "90d": "89 days", "12m": "11 months" }[
        input.range
      ];

      const rows = await context.db.$queryRawUnsafe<
        { bucket: string; words: number; notes: number }[]
      >(
        `
        WITH calendar AS (
          SELECT generate_series(
            date_trunc($3, (now() AT TIME ZONE $2)) - $4::interval,
            date_trunc($3, (now() AT TIME ZONE $2)),
            ('1 ' || $3)::interval
          ) AS bucket
        ),
        entries AS (
          SELECT
            date_trunc($3, (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $2)) AS bucket,
            ${WORDS} AS words
          FROM "Note" n
          JOIN "Journal" j ON j."id" = n."journalId"
          WHERE j."userId" = $1 AND j."trash" = false
        )
        SELECT
          to_char(c.bucket, CASE WHEN $3 = 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END) AS "bucket",
          COALESCE(SUM(e.words), 0)::int AS "words",
          COUNT(e.words)::int AS "notes"
        FROM calendar c
        LEFT JOIN entries e ON e.bucket = c.bucket
        GROUP BY c.bucket
        ORDER BY c.bucket
        `,
        context.userId,
        zone,
        bucket,
        interval,
      );

      return { range: input.range, bucket, points: rows };
    }),
};
