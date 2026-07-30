import { beforeEach, describe, expect, it } from "vitest";
import {
  callerFor,
  makeJournal,
  makeNote,
  testDb,
  USER_A,
  USER_B,
} from "../helpers/db";

/**
 * Cross-tenant access tests.
 *
 * The rule under test: user B asking for user A's resource gets NOT_FOUND —
 * never the data, and never FORBIDDEN. FORBIDDEN would confirm the id exists and
 * turn every endpoint into an id oracle, so "not found" is the deliberate answer
 * for both a missing resource and someone else's.
 *
 * Every procedure that takes an id gets a case here. These are the tests the
 * whole suite exists for: the bug they cover shipped, and it was invisible to
 * typechecking.
 */

const asA = () => callerFor(USER_A);
const asB = () => callerFor(USER_B);
const asAnon = () => callerFor(null);

/** Asserts an ORPCError with the given code. */
async function expectOrpcError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("notesRouter — cross-tenant access", () => {
  let journalA: Awaited<ReturnType<typeof makeJournal>>;
  let noteA: Awaited<ReturnType<typeof makeNote>>;

  beforeEach(async () => {
    journalA = await makeJournal(USER_A, { title: "A's private journal" });
    noteA = await makeNote(journalA.id, { title: "A's private note" });
  });

  it("createNote refuses to plant a note in someone else's journal", async () => {
    await expectOrpcError(
      asB().notesRouter.createNote({ journalId: journalA.id }),
      "NOT_FOUND",
    );

    // And nothing was written.
    const count = await testDb.note.count({
      where: { journalId: journalA.id },
    });
    expect(count).toBe(1);
  });

  it("getAllNotesByIdAndDate does not leak another user's note titles", async () => {
    await expectOrpcError(
      asB().notesRouter.getAllNotesByIdAndDate({
        journalId: journalA.id,
        date: "2026-07-30",
        timeZone: "UTC",
      }),
      "NOT_FOUND",
    );
  });

  it("getNoteCountsByMonth does not leak another user's activity", async () => {
    await expectOrpcError(
      asB().notesRouter.getNoteCountsByMonth({
        journalId: journalA.id,
        month: "2026-07",
        timeZone: "UTC",
      }),
      "NOT_FOUND",
    );
  });

  it("getNoteById does not return another user's note", async () => {
    await expectOrpcError(
      asB().notesRouter.getNoteById({ noteId: noteA.id }),
      "NOT_FOUND",
    );
  });

  it("saveNote cannot overwrite another user's note", async () => {
    await expectOrpcError(
      asB().notesRouter.saveNote({
        noteId: noteA.id,
        content: [{ type: "p", children: [{ text: "vandalised" }] }],
      }),
      "NOT_FOUND",
    );

    // The content is untouched.
    const after = await testDb.note.findUniqueOrThrow({
      where: { id: noteA.id },
    });
    expect(JSON.stringify(after.content)).not.toContain("vandalised");
  });

  it("renameNote cannot retitle another user's note", async () => {
    await expectOrpcError(
      asB().notesRouter.renameNote({ noteId: noteA.id, title: "pwned" }),
      "NOT_FOUND",
    );

    const after = await testDb.note.findUniqueOrThrow({
      where: { id: noteA.id },
    });
    expect(after.title).toBe("A's private note");
  });

  it("deleteNote cannot delete another user's note", async () => {
    await expectOrpcError(
      asB().notesRouter.deleteNote({ noteId: noteA.id }),
      "NOT_FOUND",
    );

    expect(await testDb.note.count({ where: { id: noteA.id } })).toBe(1);
  });

  it("returns NOT_FOUND — not FORBIDDEN — so ids are not enumerable", async () => {
    // The same code for "someone else's note" and "no such note". An attacker
        // cannot tell the two apart, which is the point.
    const someoneElses = asB().notesRouter.getNoteById({ noteId: noteA.id });
    const nonexistent = asB().notesRouter.getNoteById({
      noteId: "cuid_does_not_exist",
    });

    await expectOrpcError(someoneElses, "NOT_FOUND");
    await expectOrpcError(nonexistent, "NOT_FOUND");
  });

  it("refuses anonymous callers with UNAUTHORIZED", async () => {
    // Distinct from NOT_FOUND on purpose: not being signed in is a different
    // problem from asking for something that is not yours, and the client should
    // respond by sending you to sign in.
    await expectOrpcError(
      asAnon().notesRouter.getNoteById({ noteId: noteA.id }),
      "UNAUTHORIZED",
    );
    await expectOrpcError(
      asAnon().notesRouter.createNote({ journalId: journalA.id }),
      "UNAUTHORIZED",
    );
  });
});

describe("notesRouter — trashed journals are inaccessible", () => {
  it("blocks note reads and writes once the journal is trashed", async () => {
    const journal = await makeJournal(USER_A, { trash: true });
    const note = await makeNote(journal.id);

    const a = asA();

    await expectOrpcError(
      a.notesRouter.createNote({ journalId: journal.id }),
      "NOT_FOUND",
    );
    await expectOrpcError(
      a.notesRouter.getNoteById({ noteId: note.id }),
      "NOT_FOUND",
    );
    await expectOrpcError(
      a.notesRouter.saveNote({
        noteId: note.id,
        content: [{ type: "p", children: [{ text: "x" }] }],
      }),
      "NOT_FOUND",
    );
    await expectOrpcError(
      a.notesRouter.getAllNotesByIdAndDate({
        journalId: journal.id,
        date: "2026-07-30",
        timeZone: "UTC",
      }),
      "NOT_FOUND",
    );
  });
});

describe("journalRouter — cross-tenant access", () => {
  let journalA: Awaited<ReturnType<typeof makeJournal>>;

  beforeEach(async () => {
    journalA = await makeJournal(USER_A);
  });

  it("getJournalById returns null for another user's journal", async () => {
    // Null rather than a throw: the page renders notFound() from this, and a
    // missing journal is an expected navigation outcome.
    await expect(
      asB().journalRouter.getJournalById({ id: journalA.id }),
    ).resolves.toBeNull();
  });

  it("getAllJournal only ever returns the caller's own journals", async () => {
    await makeJournal(USER_B, { title: "B's journal" });

    const forA = await asA().journalRouter.getAllJournal();
    const forB = await asB().journalRouter.getAllJournal();

    expect(forA.map((j) => j.userId)).toEqual([USER_A]);
    expect(forB.map((j) => j.userId)).toEqual([USER_B]);
  });

  it("getTrashedJournal only ever returns the caller's own journals", async () => {
    await makeJournal(USER_A, { trash: true, title: "A trashed" });
    await makeJournal(USER_B, { trash: true, title: "B trashed" });

    const forB = await asB().journalRouter.getTrashedJournal();

    expect(forB).toHaveLength(1);
    expect(forB[0]?.title).toBe("B trashed");
  });

  it("moveToTrash cannot trash another user's journal", async () => {
    await expectOrpcError(
      asB().journalRouter.moveToTrash({ id: journalA.id }),
      "NOT_FOUND",
    );

    const after = await testDb.journal.findUniqueOrThrow({
      where: { id: journalA.id },
    });
    expect(after.trash).toBe(false);
  });

  it("removeFromTrash cannot restore another user's journal", async () => {
    const trashed = await makeJournal(USER_A, { trash: true });

    await expectOrpcError(
      asB().journalRouter.removeFromTrash({ id: trashed.id }),
      "NOT_FOUND",
    );

    const after = await testDb.journal.findUniqueOrThrow({
      where: { id: trashed.id },
    });
    expect(after.trash).toBe(true);
  });

  it("deletePermanently cannot delete another user's journal", async () => {
    await expectOrpcError(
      asB().journalRouter.deletePermanently({ id: journalA.id }),
      "NOT_FOUND",
    );

    expect(await testDb.journal.count({ where: { id: journalA.id } })).toBe(1);
  });

  it("mutations on a nonexistent id are NOT_FOUND, not 401", async () => {
    // The regression this guards: these used to throw UNAUTHORIZED, which would
    // bounce a legitimately signed-in user out of the app.
    const a = asA();

    await expectOrpcError(
      a.journalRouter.moveToTrash({ id: "nope" }),
      "NOT_FOUND",
    );
    await expectOrpcError(
      a.journalRouter.removeFromTrash({ id: "nope" }),
      "NOT_FOUND",
    );
    await expectOrpcError(
      a.journalRouter.deletePermanently({ id: "nope" }),
      "NOT_FOUND",
    );
  });

  it("refuses anonymous callers", async () => {
    await expectOrpcError(
      asAnon().journalRouter.getAllJournal(),
      "UNAUTHORIZED",
    );
  });
});

describe("owners can still do everything", () => {
  it("supports the full note lifecycle for the owner", async () => {
    const a = asA();

    const journalId = await a.journalRouter.createJournal({
      title: "My journal",
      description: "A description",
    });

    const created = await a.notesRouter.createNote({ journalId });
    expect(created.journalId).toBe(journalId);

    // createNote writes a real empty Plate document, not "".
    expect(created.content).toEqual([{ type: "p", children: [{ text: "" }] }]);

    const renamed = await a.notesRouter.renameNote({
      noteId: created.id,
      title: "Renamed",
    });
    expect(renamed.title).toBe("Renamed");

    const saved = await a.notesRouter.saveNote({
      noteId: created.id,
      content: [{ type: "p", children: [{ text: "hello" }] }],
    });
    // Returns only the note, not the joined journal row.
    expect(Object.keys(saved).sort()).toEqual(["content", "id"]);

    const fetched = await a.notesRouter.getNoteById({ noteId: created.id });
    expect(JSON.stringify(fetched.content)).toContain("hello");

    await a.notesRouter.deleteNote({ noteId: created.id });
    await expectOrpcError(
      a.notesRouter.getNoteById({ noteId: created.id }),
      "NOT_FOUND",
    );
  });
});
