import { describe, expect, it } from "vitest";
import { callerFor, makeJournal, makeNote, USER_A, USER_B } from "../helpers/db";

/**
 * Dashboard statistics.
 *
 * These are raw-SQL aggregates — gaps-and-islands for streaks, `generate_series`
 * for the word-count calendar — so they get exercised against real Postgres rather
 * than trusted. Timezone bucketing is checked here too: a streak computed in the
 * server's zone rather than the reader's breaks at a different hour of the day.
 */

/** A note at a specific UTC instant with a known word count. */
function noteAt(journalId: string, iso: string, text: string) {
  return makeNote(journalId, {
    createdAt: new Date(iso),
    content: [{ type: "p", children: [{ text }] }],
    plainText: text,
  });
}

/** N days before today, at noon UTC — safely inside the day in most zones. */
function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

describe("getTotals", () => {
  it("counts journals, notes, words and distinct days", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeJournal(USER_A);

    await noteAt(journal.id, "2026-07-01T12:00:00Z", "one two three");
    await noteAt(journal.id, "2026-07-01T18:00:00Z", "four five");
    await noteAt(journal.id, "2026-07-05T12:00:00Z", "six");

    const totals = await a.statsRouter.getTotals({ timeZone: "UTC" });

    expect(totals.journals).toBe(2);
    expect(totals.notes).toBe(3);
    expect(totals.words).toBe(6);
    // Two calendar days, though there were three notes.
    expect(totals.daysActive).toBe(2);
  });

  it("counts an empty note as zero words, not one", async () => {
    // regexp_split_to_array('', '\s+') returns {''}, length 1 — the guard in the
    // SQL exists precisely to stop an empty note counting as a word.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { plainText: "" });
    await makeNote(journal.id, { plainText: "   " });

    const totals = await a.statsRouter.getTotals({ timeZone: "UTC" });

    expect(totals.notes).toBe(2);
    expect(totals.words).toBe(0);
  });

  it("returns zeroes for a user with no data", async () => {
    const totals = await callerFor(USER_B).statsRouter.getTotals({
      timeZone: "UTC",
    });

    expect(totals).toMatchObject({
      journals: 0,
      notes: 0,
      words: 0,
      daysActive: 0,
    });
  });

  it("never counts another user's notes", async () => {
    const journalA = await makeJournal(USER_A);
    await noteAt(journalA.id, "2026-07-01T12:00:00Z", "private words here");

    const totals = await callerFor(USER_B).statsRouter.getTotals({
      timeZone: "UTC",
    });

    expect(totals.notes).toBe(0);
    expect(totals.words).toBe(0);
  });

  it("excludes trashed journals", async () => {
    const a = callerFor(USER_A);
    const live = await makeJournal(USER_A);
    const trashed = await makeJournal(USER_A, { trash: true });

    await noteAt(live.id, "2026-07-01T12:00:00Z", "kept");
    await noteAt(trashed.id, "2026-07-01T12:00:00Z", "discarded words");

    const totals = await a.statsRouter.getTotals({ timeZone: "UTC" });

    expect(totals.journals).toBe(1);
    expect(totals.notes).toBe(1);
    expect(totals.words).toBe(1);
  });

  it("buckets distinct days in the reader's timezone", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // Both instants are Jul 29 in UTC, but straddle midnight in IST:
    // 20:30Z is Jul 30 in IST, 10:00Z is Jul 29.
    await noteAt(journal.id, "2026-07-29T10:00:00Z", "morning");
    await noteAt(journal.id, "2026-07-29T20:30:00Z", "late");

    expect(
      (await a.statsRouter.getTotals({ timeZone: "UTC" })).daysActive,
    ).toBe(1);
    expect(
      (await a.statsRouter.getTotals({ timeZone: "Asia/Kolkata" })).daysActive,
    ).toBe(2);
  });
});

describe("getStreak", () => {
  it("counts an unbroken run ending today", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    for (const n of [0, 1, 2, 3]) {
      await noteAt(journal.id, daysAgo(n), "entry");
    }

    const streak = await a.statsRouter.getStreak({ timeZone: "UTC" });

    expect(streak.current).toBe(4);
    expect(streak.longest).toBe(4);
  });

  it("keeps the streak alive when the run ends yesterday", async () => {
    // Otherwise the number would read 0 every morning until you wrote, which is
    // both discouraging and wrong.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    for (const n of [1, 2, 3]) {
      await noteAt(journal.id, daysAgo(n), "entry");
    }

    expect((await a.statsRouter.getStreak({ timeZone: "UTC" })).current).toBe(3);
  });

  it("reports a broken streak as zero but remembers the longest", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // A five-day run that ended a fortnight ago.
    for (const n of [14, 15, 16, 17, 18]) {
      await noteAt(journal.id, daysAgo(n), "entry");
    }

    const streak = await a.statsRouter.getStreak({ timeZone: "UTC" });

    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(5);
  });

  it("does not let several notes on one day inflate the streak", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // Three notes, one day. That is a streak of 1, not 3 — the DISTINCT matters.
    const today = daysAgo(0);
    await noteAt(journal.id, today, "first");
    await noteAt(journal.id, today, "second");
    await noteAt(journal.id, today, "third");

    const streak = await a.statsRouter.getStreak({ timeZone: "UTC" });

    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it("picks the longest of several separate runs", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // 2 days, gap, 4 days, gap, 1 day.
    for (const n of [40, 41, 30, 31, 32, 33, 20]) {
      await noteAt(journal.id, daysAgo(n), "entry");
    }

    const streak = await a.statsRouter.getStreak({ timeZone: "UTC" });

    expect(streak.longest).toBe(4);
    expect(streak.current).toBe(0);
  });

  it("returns zeroes with no notes at all", async () => {
    await makeJournal(USER_A);

    expect(
      await callerFor(USER_A).statsRouter.getStreak({ timeZone: "UTC" }),
    ).toEqual({ current: 0, longest: 0 });
  });

  it("never counts another user's days", async () => {
    const journalA = await makeJournal(USER_A);
    for (const n of [0, 1, 2]) {
      await noteAt(journalA.id, daysAgo(n), "entry");
    }

    expect(
      await callerFor(USER_B).statsRouter.getStreak({ timeZone: "UTC" }),
    ).toEqual({ current: 0, longest: 0 });
  });
});

describe("getActivity", () => {
  it("returns per-day counts and words for the year", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await noteAt(journal.id, "2026-03-14T12:00:00Z", "one two");
    await noteAt(journal.id, "2026-03-14T15:00:00Z", "three");
    await noteAt(journal.id, "2026-06-01T12:00:00Z", "solo");

    const activity = await a.statsRouter.getActivity({
      year: 2026,
      timeZone: "UTC",
    });

    expect(activity.year).toBe(2026);
    expect(activity.byDay["2026-03-14"]).toEqual({ count: 2, words: 3 });
    expect(activity.byDay["2026-06-01"]).toEqual({ count: 1, words: 1 });
  });

  it("bounds results to the requested year", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await noteAt(journal.id, "2025-12-31T12:00:00Z", "last year");
    await noteAt(journal.id, "2026-06-01T12:00:00Z", "this year");
    await noteAt(journal.id, "2027-01-01T12:00:00Z", "next year");

    const activity = await a.statsRouter.getActivity({
      year: 2026,
      timeZone: "UTC",
    });

    expect(Object.keys(activity.byDay)).toEqual(["2026-06-01"]);
  });

  it("shifts the year boundary with the timezone", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    // 2025-12-31T20:00Z is already 2026-01-01 in IST.
    await noteAt(journal.id, "2025-12-31T20:00:00Z", "new year in IST");

    const utc = await a.statsRouter.getActivity({ year: 2026, timeZone: "UTC" });
    expect(utc.byDay).toEqual({});

    const ist = await a.statsRouter.getActivity({
      year: 2026,
      timeZone: "Asia/Kolkata",
    });
    expect(ist.byDay["2026-01-01"]).toEqual({ count: 1, words: 4 });
  });

  it("returns an empty map rather than failing for a quiet year", async () => {
    await makeJournal(USER_A);

    const activity = await callerFor(USER_A).statsRouter.getActivity({
      year: 2020,
      timeZone: "UTC",
    });

    expect(activity.byDay).toEqual({});
  });
});

describe("getWordCounts", () => {
  it("emits an explicit zero for every empty day in the range", async () => {
    // The line must not join across a gap and imply writing that did not happen.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await noteAt(journal.id, daysAgo(2), "three words here");

    const result = await a.statsRouter.getWordCounts({
      range: "30d",
      timeZone: "UTC",
    });

    expect(result.bucket).toBe("day");
    // 30 days inclusive of today.
    expect(result.points).toHaveLength(30);

    const written = result.points.filter((p) => p.words > 0);
    expect(written).toHaveLength(1);
    expect(written[0]?.words).toBe(3);

    // Every other bucket is present and zero, not missing.
    expect(result.points.filter((p) => p.words === 0)).toHaveLength(29);
  });

  it("covers 90 days for the 90d range", async () => {
    await makeJournal(USER_A);

    const result = await callerFor(USER_A).statsRouter.getWordCounts({
      range: "90d",
      timeZone: "UTC",
    });

    expect(result.points).toHaveLength(90);
    expect(result.bucket).toBe("day");
  });

  it("switches to monthly buckets for 12m", async () => {
    // 365 daily points is noise, not a trend.
    await makeJournal(USER_A);

    const result = await callerFor(USER_A).statsRouter.getWordCounts({
      range: "12m",
      timeZone: "UTC",
    });

    expect(result.bucket).toBe("month");
    expect(result.points).toHaveLength(12);
    expect(result.points[0]?.bucket).toMatch(/^\d{4}-\d{2}$/);
  });

  it("sums words and counts notes per bucket", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await noteAt(journal.id, daysAgo(1), "one two three");
    await noteAt(journal.id, daysAgo(1), "four five");

    const result = await a.statsRouter.getWordCounts({
      range: "30d",
      timeZone: "UTC",
    });

    const day = result.points.find((p) => p.words > 0);
    expect(day?.words).toBe(5);
    expect(day?.notes).toBe(2);
  });

  it("never includes another user's words", async () => {
    const journalA = await makeJournal(USER_A);
    await noteAt(journalA.id, daysAgo(1), "secret words");

    const result = await callerFor(USER_B).statsRouter.getWordCounts({
      range: "30d",
      timeZone: "UTC",
    });

    expect(result.points.every((p) => p.words === 0)).toBe(true);
  });
});
