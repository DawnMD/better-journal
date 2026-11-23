import { beforeEach, describe, expect, it } from "vitest";
import {
  assertJournalOwned,
  deleteNote,
  findNote,
  liveNoteWhere,
  ownedNoteWhere,
  updateNote,
} from "@/server/lib/note-access";
import { makeJournal, makeNote, testDb, USER_A, USER_B } from "../helpers/db";

/**
 * The note access rule, tested once against the module.
 *
 * A note is reachable by a signed-in user only when it is an owned note of a
 * live journal. Every other note — someone else's, one in a trashed journal, one
 * that never existed — answers NOT_FOUND, never FORBIDDEN, so ids cannot be
 * probed. The routers only wire procedures to this module; their own tests check
 * that wiring, not the matrix.
 */

const as = (userId: string) => ({ db: testDb, userId });

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
}

type Fixture = { noteId: string; caller: string };

/** The three notes nobody but their live owner can reach, from USER_A's seat. */
const unreachable: Record<string, () => Promise<Fixture>> = {
  "a foreign note": async () => {
    const journal = await makeJournal(USER_B);
    const note = await makeNote(journal.id, { title: "B's note" });
    return { noteId: note.id, caller: USER_A };
  },
  "a note of a trashed journal": async () => {
    const journal = await makeJournal(USER_A, { trash: true });
    const note = await makeNote(journal.id, { title: "trashed note" });
    return { noteId: note.id, caller: USER_A };
  },
  "a nonexistent note": async () => ({
    noteId: "cuid_does_not_exist",
    caller: USER_A,
  }),
};

describe("note access — an owned note of a live journal", () => {
  let journalId: string;
  let noteId: string;

  beforeEach(async () => {
    const journal = await makeJournal(USER_A);
    journalId = journal.id;
    noteId = (await makeNote(journal.id, { title: "mine" })).id;
  });

  it("find returns the public shape and nothing else", async () => {
    const note = await findNote(as(USER_A), noteId);

    expect(note.id).toBe(noteId);
    expect(note.journalId).toBe(journalId);
    expect(note.title).toBe("mine");
    // No plainText, no searchVector, no joined journal: a column added to Note
    // does not start reaching the browser on its own.
    expect(Object.keys(note).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "journalId",
      "title",
      "updatedAt",
    ]);
  });

  it("update writes to the note", async () => {
    await updateNote(as(USER_A), noteId, { title: "renamed" });

    const after = await testDb.note.findUniqueOrThrow({ where: { id: noteId } });
    expect(after.title).toBe("renamed");
  });

  it("delete removes the note", async () => {
    await deleteNote(as(USER_A), noteId);

    expect(await testDb.note.count({ where: { id: noteId } })).toBe(0);
  });
});

for (const [name, setup] of Object.entries(unreachable)) {
  describe(`note access — ${name}`, () => {
    it("find is NOT_FOUND", async () => {
      const { noteId, caller } = await setup();

      await expectNotFound(findNote(as(caller), noteId));
    });

    it("update is NOT_FOUND and writes nothing", async () => {
      const { noteId, caller } = await setup();
      const before = await testDb.note.findUnique({ where: { id: noteId } });

      await expectNotFound(updateNote(as(caller), noteId, { title: "pwned" }));

      const after = await testDb.note.findUnique({ where: { id: noteId } });
      expect(after?.title).toBe(before?.title);
    });

    it("delete is NOT_FOUND and removes nothing", async () => {
      const { noteId, caller } = await setup();
      const before = await testDb.note.count({ where: { id: noteId } });

      await expectNotFound(deleteNote(as(caller), noteId));

      expect(await testDb.note.count({ where: { id: noteId } })).toBe(before);
    });
  });
}

describe("note access — the journal a note is created in or listed from", () => {
  it("accepts an owned live journal", async () => {
    const journal = await makeJournal(USER_A);

    await expect(
      assertJournalOwned(as(USER_A), journal.id),
    ).resolves.toEqual({ id: journal.id });
  });

  it("answers NOT_FOUND for a foreign, trashed or nonexistent journal", async () => {
    const foreign = await makeJournal(USER_B);
    const trashed = await makeJournal(USER_A, { trash: true });

    await expectNotFound(assertJournalOwned(as(USER_A), foreign.id));
    await expectNotFound(assertJournalOwned(as(USER_A), trashed.id));
    await expectNotFound(assertJournalOwned(as(USER_A), "cuid_does_not_exist"));
  });
});

describe("note access — predicates for list queries", () => {
  it("ownedNoteWhere matches only the caller's notes of live journals", async () => {
    const live = await makeJournal(USER_A);
    const trashed = await makeJournal(USER_A, { trash: true });
    const foreign = await makeJournal(USER_B);
    const mine = await makeNote(live.id);
    await makeNote(trashed.id);
    await makeNote(foreign.id);

    const found = await testDb.note.findMany({
      where: ownedNoteWhere(USER_A),
      select: { id: true },
    });

    expect(found.map((note) => note.id)).toEqual([mine.id]);
  });

  it("liveNoteWhere matches notes of any live journal, whoever owns it", async () => {
    const liveA = await makeJournal(USER_A);
    const liveB = await makeJournal(USER_B);
    const trashed = await makeJournal(USER_A, { trash: true });
    const noteA = await makeNote(liveA.id);
    const noteB = await makeNote(liveB.id);
    await makeNote(trashed.id);

    const found = await testDb.note.findMany({
      where: liveNoteWhere,
      select: { id: true },
    });

    expect(found.map((note) => note.id).sort()).toEqual(
      [noteA.id, noteB.id].sort(),
    );
  });
});
