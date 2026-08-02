import { describe, expect, it } from "vitest";
import { callerFor, makeJournal, makeNote, USER_A } from "../helpers/db";

/**
 * End-to-end timezone agreement.
 *
 * The bug this covers: the note *list* bucketed days with `startOfDay` in the
 * server's zone, while the calendar *badges* were counted client-side with
 * `format()` in the browser's zone. In IST the two disagreed for anything
 * written before 05:30 local, so a note could appear in the list for a day whose
 * badge read 0 — or count toward a badge and then be missing from the list.
 *
 * There is now one query behind the whole grid, and it labels each note with the
 * `day` cell it belongs in. So the invariant worth testing has become sharper:
 * the day a note reports must be the day whose window actually contains it, in
 * every zone — and the range must contain exactly the notes it should.
 */

// 02:00 IST on 2026-07-30 is 20:30 UTC on 2026-07-29 — the exact case that broke.
const EARLY_MORNING_IST = new Date("2026-07-29T20:30:00Z");

/** The month grid for July 2026: Sun Jun 28 through Sat Aug 8, six weeks. */
const JULY_GRID = { start: "2026-06-28", end: "2026-08-08" };

/** Per-day counts, as the calendar derives them — from the notes themselves. */
const countByDay = (notes: { day: string }[]) =>
  notes.reduce<Record<string, number>>((acc, note) => {
    acc[note.day] = (acc[note.day] ?? 0) + 1;
    return acc;
  }, {});

describe("the calendar grid files notes under the reader's day", () => {
  it("files an early-morning IST note under the IST day, not the UTC one", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      title: "2am thoughts",
      createdAt: EARLY_MORNING_IST,
    });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
      timeZone: "Asia/Kolkata",
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("2am thoughts");
    expect(notes[0]?.day).toBe("2026-07-30");
    // 02:00 local, so two hours into the day — where the time grid draws it.
    expect(notes[0]?.minutes).toBe(120);
  });

  it("files the same note under Jul 29 when read in UTC", async () => {
    // Not a bug — a different reader in a different zone genuinely did see that
    // instant on the 29th. The point is that one answer covers the whole grid.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
      timeZone: "UTC",
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]?.day).toBe("2026-07-29");
    expect(notes[0]?.minutes).toBe(20 * 60 + 30);
  });

  it("agrees with a single-day query, in every zone, for every day it reports", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // Notes scattered across boundary-sensitive instants.
    const instants = [
      "2026-07-01T00:30:00Z",
      "2026-07-14T18:29:00Z",
      "2026-07-14T18:31:00Z",
      "2026-07-15T23:59:00Z",
      "2026-07-31T18:29:00Z",
      "2026-07-31T23:30:00Z",
    ].map((iso) => new Date(iso));

    for (const createdAt of instants) {
      await makeNote(journal.id, { createdAt });
    }

    for (const timeZone of [
      "UTC",
      "Asia/Kolkata",
      "America/New_York",
      "Asia/Kathmandu",
      "Pacific/Kiritimati",
    ]) {
      const grid = await a.notesRouter.getNotesInRange({
        journalId: journal.id,
        ...JULY_GRID,
        timeZone,
      });

      // Every cell the month grid would draw must hold exactly what the day view
      // shows for that same date. These are the same procedure at two different
      // widths, which is the property that makes switching view safe.
      for (const [day, count] of Object.entries(countByDay(grid))) {
        const dayView = await a.notesRouter.getNotesInRange({
          journalId: journal.id,
          start: day,
          end: day,
          timeZone,
        });

        expect(
          dayView.length,
          `${timeZone} ${day}: grid held ${count}, day view returned ${dayView.length}`,
        ).toBe(count);
        expect(dayView.every((note) => note.day === day)).toBe(true);
      }
    }
  });

  it("bounds results to the requested range", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, { createdAt: new Date("2026-06-15T12:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-15T12:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-09-15T12:00:00Z") });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
      timeZone: "UTC",
    });

    // Only what is on screen, so the query cost does not grow with journal size.
    expect(notes.map((note) => note.day)).toEqual(["2026-07-15"]);
  });

  it("includes both named days, inclusively", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, { createdAt: new Date("2026-07-05T00:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-11T23:59:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-12T00:00:00Z") });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      start: "2026-07-05",
      end: "2026-07-11",
      timeZone: "UTC",
    });

    expect(notes.map((note) => note.day)).toEqual([
      "2026-07-05",
      "2026-07-11",
    ]);
  });

  it("returns notes in chronological order, which the time grid depends on", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, { createdAt: new Date("2026-07-15T18:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-15T06:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-14T09:00:00Z") });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
      timeZone: "UTC",
    });

    expect(notes.map((note) => [note.day, note.minutes])).toEqual([
      ["2026-07-14", 9 * 60],
      ["2026-07-15", 6 * 60],
      ["2026-07-15", 18 * 60],
    ]);
  });

  it("refuses a span wider than the grid rather than draining the journal", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await expect(
      a.notesRouter.getNotesInRange({
        journalId: journal.id,
        start: "2026-01-01",
        end: "2026-12-31",
        timeZone: "UTC",
      }),
    ).rejects.toThrow();
  });

  it("falls back to UTC for a junk timezone instead of failing", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
      timeZone: "'; DROP TABLE \"Note\"; --",
    });

    // Behaved as UTC, and the table is obviously still there.
    expect(notes[0]?.day).toBe("2026-07-29");
  });

  it("defaults to UTC when no timezone is supplied", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...JULY_GRID,
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]?.day).toBe("2026-07-29");
  });
});

/**
 * The default title's date and clock, back as machine-readable numbers.
 *
 * Titles read "August 2nd, 2026 at 9:52 AM". Parsing rather than string-matching
 * because the assertion needs a *tolerance*: the test clock advances between the
 * call and the check, and a minute rolling over there is not a bug.
 */
function readTitle(title: string | null) {
  const match = title?.match(
    /^(\w+) (\d+)(?:st|nd|rd|th), (\d+) at (\d+):(\d+) (AM|PM)$/,
  );
  if (!match) throw new Error(`Unparsable default title: ${title}`);

  const [, month, day, year, hour, minute, meridiem] = match;
  const hour24 = (Number(hour) % 12) + (meridiem === "PM" ? 12 : 0);

  return {
    date: `${month} ${day}, ${year}`,
    minutes: hour24 * 60 + Number(minute),
  };
}

/** The same two fields, read off an instant directly. */
function wallClock(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const at = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${at("month")} ${at("day")}, ${at("year")}`,
    minutes: Number(at("hour")) * 60 + Number(at("minute")),
  };
}

describe("a new note is titled in the writer's zone", () => {
  /**
   * The bug: the title was `format(new Date(), …)`, which reads the *server's*
   * zone. On Vercel that is UTC, so a note started at 09:52 IST opened titled
   * "August 2nd, 2026 at 4:22 AM" — five and a half hours in the past, and on
   * the wrong date for anything written after 05:30 IST… or before it.
   *
   * Every zone here, not just IST: a positive offset, a negative one, one that
   * is not a whole hour, and UTC itself, which is the only one the old code got
   * right and the reason this went unnoticed in CI.
   */
  it.each(["Asia/Kolkata", "America/New_York", "Asia/Kathmandu", "UTC"])(
    "quotes the local wall clock in %s, not the server's",
    async (timeZone) => {
      const a = callerFor(USER_A);
      const journal = await makeJournal(USER_A);

      const note = await a.notesRouter.createNote({
        journalId: journal.id,
        timeZone,
      });

      const title = readTitle(note.title);
      const expected = wallClock(new Date(), timeZone);

      expect(title.date, `${timeZone}: ${note.title}`).toBe(expected.date);
      // A minute of slack for the clock ticking mid-test — and no more, since
      // the shortest offset this has to catch (Kathmandu, +05:45) is 45.
      expect(
        Math.abs(title.minutes - expected.minutes),
        `${timeZone}: ${note.title}`,
      ).toBeLessThanOrEqual(1);
    },
  );

  it("falls back to UTC for a junk zone rather than failing the write", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    const note = await a.notesRouter.createNote({
      journalId: journal.id,
      timeZone: "Mars/Olympus_Mons",
    });

    const title = readTitle(note.title);
    const expected = wallClock(new Date(), "UTC");

    expect(title.date).toBe(expected.date);
    expect(Math.abs(title.minutes - expected.minutes)).toBeLessThanOrEqual(1);
  });
});
