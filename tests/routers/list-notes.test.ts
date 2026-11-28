import { describe, expect, it } from "vitest";
import { callerFor, makeJournal, makeNote, USER_A } from "../helpers/db";

/**
 * The journal page's note list: every note in a journal, newest first, paged by
 * cursor so it can scroll back through years without loading them all.
 */

describe("listNotes", () => {
  it("lists a journal's notes newest first, filed under the reader's day", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      title: "older",
      createdAt: new Date("2026-06-10T12:00:00Z"),
    });
    // 02:00 IST on Jul 30 — Jul 29 in UTC.
    await makeNote(journal.id, {
      title: "newer",
      createdAt: new Date("2026-07-29T20:30:00Z"),
    });

    const page = await a.notesRouter.listNotes({
      journalId: journal.id,
      timeZone: "Asia/Kolkata",
    });

    expect(page.notes.map((n) => [n.title, n.day])).toEqual([
      ["newer", "2026-07-30"],
      ["older", "2026-06-10"],
    ]);
  });

  it("shows each note's tags and a short plain-text preview", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const long = await makeNote(journal.id, {
      createdAt: new Date("2026-07-01T09:00:00Z"),
      // 200 characters across two paragraphs, with ragged whitespace.
      plainText: `${"word ".repeat(20).trim()}\n\n   ${"more ".repeat(20).trim()}`,
    });
    await makeNote(journal.id, {
      createdAt: new Date("2026-07-02T09:00:00Z"),
      plainText: "  Short\nand sweet  ",
    });
    await a.tagRouter.addTagToNote({ noteId: long.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: long.id, name: "idea" });

    const { notes } = await a.notesRouter.listNotes({
      journalId: journal.id,
      timeZone: "UTC",
    });

    expect(notes[0]?.preview).toBe("Short and sweet");
    expect(notes[0]?.tags).toEqual([]);

    // Cut on a word boundary so that, ellipsis included, it is at most 160.
    const preview = `${"word ".repeat(20)}${"more ".repeat(12).trim()}…`;
    expect(preview).toHaveLength(160);
    expect(notes[1]?.preview).toBe(preview);
    expect(notes[1]?.tags.map((t) => t.name)).toEqual(["idea", "work"]);
  });

  it("pages older notes by cursor across month boundaries, skipping none", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const sameInstant = new Date("2026-06-15T08:00:00Z");
    for (const [title, at] of [
      ["may", new Date("2026-05-31T23:00:00Z")],
      ["june a", sameInstant],
      ["june b", sameInstant],
      ["july", new Date("2026-07-01T00:30:00Z")],
      ["august", new Date("2026-08-20T10:00:00Z")],
    ] as const) {
      await makeNote(journal.id, { title, createdAt: at });
    }

    const titles: (string | null)[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await a.notesRouter.listNotes({
        journalId: journal.id,
        timeZone: "UTC",
        limit: 2,
        cursor: cursor ?? undefined,
      });
      titles.push(...page.notes.map((n) => n.title));
      cursor = page.olderCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    // The two June notes share an instant; the tie is broken by id, so both
    // appear exactly once whichever page boundary falls between them.
    expect(titles).toHaveLength(5);
    expect(titles.slice(0, 2)).toEqual(["august", "july"]);
    expect(new Set(titles.slice(2, 4))).toEqual(new Set(["june a", "june b"]));
    expect(titles[4]).toBe("may");
  });

  it("opens on an anchor day in the reader's zone and pages newer from there", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    for (const [title, at] of [
      ["jun 10", "2026-06-10T12:00:00Z"],
      // 02:00 IST on Jul 30.
      ["jul 30", "2026-07-29T20:30:00Z"],
      // 00:30 IST on Jul 31 — still Jul 30 in UTC, but after the IST anchor day.
      ["jul 31", "2026-07-30T19:00:00Z"],
      ["aug 5", "2026-08-05T10:00:00Z"],
    ] as const) {
      await makeNote(journal.id, { title, createdAt: new Date(at) });
    }
    const list = (extra: object) =>
      a.notesRouter.listNotes({
        journalId: journal.id,
        timeZone: "Asia/Kolkata",
        ...extra,
      });

    const first = await list({ anchor: "2026-07-30" });
    expect(first.notes.map((n) => n.title)).toEqual(["jul 30", "jun 10"]);
    expect(first.olderCursor).toBeNull();
    expect(first.newerCursor).not.toBeNull();

    // Newer pages hold the notes nearest the anchor first, still newest-first
    // within the page, so they stack straight on top of the list.
    const up = await list({
      cursor: first.newerCursor,
      direction: "newer",
      limit: 1,
    });
    expect(up.notes.map((n) => n.title)).toEqual(["jul 31"]);
    expect(up.newerCursor).not.toBeNull();

    const top = await list({
      cursor: up.newerCursor,
      direction: "newer",
      limit: 1,
    });
    expect(top.notes.map((n) => n.title)).toEqual(["aug 5"]);
    expect(top.newerCursor).toBeNull();
  });

  it("narrows to notes carrying every filtered tag, pages included", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const tagged = async (title: string, day: string, tags: string[]) => {
      const note = await makeNote(journal.id, {
        title,
        createdAt: new Date(`${day}T12:00:00Z`),
      });
      for (const name of tags) {
        await a.tagRouter.addTagToNote({ noteId: note.id, name });
      }
    };
    await tagged("untagged, oldest", "2026-05-01", []);
    await tagged("work", "2026-06-01", ["work"]);
    await tagged("both", "2026-07-01", ["work", "idea"]);
    await tagged("idea", "2026-08-01", ["idea"]);
    const tags = await a.tagRouter.getAllTags();
    const id = (name: string) => tags.find((t) => t.name === name)!.id;
    const list = (extra: object) =>
      a.notesRouter.listNotes({
        journalId: journal.id,
        timeZone: "UTC",
        ...extra,
      });

    const both = await list({ tagIds: [id("work"), id("idea")] });
    expect(both.notes.map((n) => n.title)).toEqual(["both"]);

    const first = await list({ tagIds: [id("work")], limit: 1 });
    expect(first.notes.map((n) => n.title)).toEqual(["both"]);
    // "idea" is newer, but it is not a work note.
    expect(first.newerCursor).toBeNull();

    const second = await list({
      tagIds: [id("work")],
      limit: 1,
      cursor: first.olderCursor,
    });
    expect(second.notes.map((n) => n.title)).toEqual(["work"]);
    // The untagged note is older, but it is not a work note either.
    expect(second.olderCursor).toBeNull();
  });

  it("has no newer page when opened without an anchor", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id);

    const page = await a.notesRouter.listNotes({
      journalId: journal.id,
      timeZone: "UTC",
    });

    expect(page.newerCursor).toBeNull();
  });
});
