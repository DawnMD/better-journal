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
 * Both now come from the server with an explicit zone, so the invariant worth
 * testing is that they agree.
 */

// 02:00 IST on 2026-07-30 is 20:30 UTC on 2026-07-29 — the exact case that broke.
const EARLY_MORNING_IST = new Date("2026-07-29T20:30:00Z");

describe("note list and calendar badges agree", () => {
  it("files an early-morning IST note under the IST day in both views", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      title: "2am thoughts",
      createdAt: EARLY_MORNING_IST,
    });

    const list = await a.notesRouter.getAllNotesByIdAndDate({
      journalId: journal.id,
      date: "2026-07-30",
      timeZone: "Asia/Kolkata",
    });

    const counts = await a.notesRouter.getNoteCountsByMonth({
      journalId: journal.id,
      month: "2026-07",
      timeZone: "Asia/Kolkata",
    });

    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("2am thoughts");
    expect(counts["2026-07-30"]).toBe(1);

    // And it is *not* filed under the 29th in either view.
    const listPrev = await a.notesRouter.getAllNotesByIdAndDate({
      journalId: journal.id,
      date: "2026-07-29",
      timeZone: "Asia/Kolkata",
    });
    expect(listPrev).toHaveLength(0);
    expect(counts["2026-07-29"]).toBeUndefined();
  });

  it("files the same note under Jul 29 when read in UTC", async () => {
    // Not a bug — a different reader in a different zone genuinely did see that
    // instant on the 29th. The point is that list and badges still agree.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const list = await a.notesRouter.getAllNotesByIdAndDate({
      journalId: journal.id,
      date: "2026-07-29",
      timeZone: "UTC",
    });
    const counts = await a.notesRouter.getNoteCountsByMonth({
      journalId: journal.id,
      month: "2026-07",
      timeZone: "UTC",
    });

    expect(list).toHaveLength(1);
    expect(counts["2026-07-29"]).toBe(1);
    expect(counts["2026-07-30"]).toBeUndefined();
  });

  it("agrees across every zone, for every day of a month", async () => {
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
      const counts = await a.notesRouter.getNoteCountsByMonth({
        journalId: journal.id,
        month: "2026-07",
        timeZone,
      });

      // For every badge the calendar would draw, the list for that same day must
      // return exactly that many notes.
      for (const [day, count] of Object.entries(counts)) {
        const list = await a.notesRouter.getAllNotesByIdAndDate({
          journalId: journal.id,
          date: day,
          timeZone,
        });

        expect(
          list.length,
          `${timeZone} ${day}: badge said ${count}, list returned ${list.length}`,
        ).toBe(count);
      }
    }
  });

  it("bounds badge counts to the requested month", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, { createdAt: new Date("2026-06-15T12:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-07-15T12:00:00Z") });
    await makeNote(journal.id, { createdAt: new Date("2026-08-15T12:00:00Z") });

    const counts = await a.notesRouter.getNoteCountsByMonth({
      journalId: journal.id,
      month: "2026-07",
      timeZone: "UTC",
    });

    // Only July, so the query cost does not grow with journal size.
    expect(Object.keys(counts)).toEqual(["2026-07-15"]);
  });

  it("falls back to UTC for a junk timezone instead of failing", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const counts = await a.notesRouter.getNoteCountsByMonth({
      journalId: journal.id,
      month: "2026-07",
      timeZone: "'; DROP TABLE \"Note\"; --",
    });

    // Behaved as UTC, and the table is obviously still there.
    expect(counts["2026-07-29"]).toBe(1);
  });

  it("defaults to UTC when no timezone is supplied", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { createdAt: EARLY_MORNING_IST });

    const list = await a.notesRouter.getAllNotesByIdAndDate({
      journalId: journal.id,
      date: "2026-07-29",
    });

    expect(list).toHaveLength(1);
  });
});
