import { describe, expect, it } from "vitest";
import {
  callerFor,
  makeJournal,
  makeNote,
  testDb,
  USER_A,
  USER_B,
} from "../helpers/db";

describe("tag normalisation", () => {
  it("lowercases, trims, and collapses whitespace", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "  Deep   Work " });

    const tags = await a.tagRouter.getTagsForNote({ noteId: note.id });
    expect(tags.map((t) => t.name)).toEqual(["deep work"]);
  });

  it("reuses one tag row for names that differ only by case or spacing", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const first = await makeNote(journal.id);
    const second = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: first.id, name: "Work" });
    await a.tagRouter.addTagToNote({ noteId: second.id, name: "work" });

    // One tag, two notes — not two near-identical tags cluttering the combobox.
    const all = await a.tagRouter.getAllTags();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "work", noteCount: 2 });
  });

  it("is idempotent when the same tag is added twice", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const tags = await a.tagRouter.addTagToNote({
      noteId: note.id,
      name: "work",
    });

    expect(tags).toHaveLength(1);
  });

  it("rejects an empty or overlong name", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await expect(
      a.tagRouter.addTagToNote({ noteId: note.id, name: "   " }),
    ).rejects.toBeDefined();

    await expect(
      a.tagRouter.addTagToNote({ noteId: note.id, name: "x".repeat(33) }),
    ).rejects.toBeDefined();
  });
});

describe("tags are scoped per user", () => {
  it("lets two users independently own a tag with the same name", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    const journalB = await makeJournal(USER_B);
    const noteB = await makeNote(journalB.id);

    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "work",
    });
    await callerFor(USER_B).tagRouter.addTagToNote({
      noteId: noteB.id,
      name: "work",
    });

    // Two distinct rows — the unique constraint is on (userId, name).
    expect(await testDb.tag.count({ where: { name: "work" } })).toBe(2);

    const forA = await callerFor(USER_A).tagRouter.getAllTags();
    expect(forA).toHaveLength(1);
    expect(forA[0]?.noteCount).toBe(1);
  });

  it("does not let one user tag another user's note", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);

    await expect(
      callerFor(USER_B).tagRouter.addTagToNote({
        noteId: noteA.id,
        name: "intrusion",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await testDb.tag.count()).toBe(0);
  });

  it("does not leak another user's tags on a note", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "private",
    });

    await expect(
      callerFor(USER_B).tagRouter.getTagsForNote({ noteId: noteA.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not let one user delete another user's tag", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "mine",
    });
    const [tag] = await callerFor(USER_A).tagRouter.getAllTags();

    await expect(
      callerFor(USER_B).tagRouter.deleteTag({ tagId: tag!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await testDb.tag.count()).toBe(1);
  });

  it("does not let one user detach another user's tag", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "mine",
    });
    const [tagA] = await callerFor(USER_A).tagRouter.getAllTags();

    const journalB = await makeJournal(USER_B);
    const noteB = await makeNote(journalB.id);

    // B owns noteB, but not tagA. Detaching a tag they do not own is an
    // operation on someone else's row even though the effect looks local.
    await expect(
      callerFor(USER_B).tagRouter.removeTagFromNote({
        noteId: noteB.id,
        tagId: tagA!.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("filtering notes by tag", () => {
  it("requires every requested tag to be present (AND, not OR)", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    const both = await makeNote(journal.id, { title: "both" });
    const onlyWork = await makeNote(journal.id, { title: "only work" });

    await a.tagRouter.addTagToNote({ noteId: both.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: both.id, name: "urgent" });
    await a.tagRouter.addTagToNote({ noteId: onlyWork.id, name: "work" });

    const tags = await a.tagRouter.getAllTags();
    const workId = tags.find((t) => t.name === "work")!.id;
    const urgentId = tags.find((t) => t.name === "urgent")!.id;

    const onlyWorkResults = await a.tagRouter.getNotesByTags({
      journalId: journal.id,
      tagIds: [workId],
    });
    expect(onlyWorkResults.map((n) => n.title).sort()).toEqual([
      "both",
      "only work",
    ]);

    const bothResults = await a.tagRouter.getNotesByTags({
      journalId: journal.id,
      tagIds: [workId, urgentId],
    });
    expect(bothResults.map((n) => n.title)).toEqual(["both"]);
  });

  it("refuses to filter another user's journal", async () => {
    const journalA = await makeJournal(USER_A);

    await expect(
      callerFor(USER_B).tagRouter.getNotesByTags({
        journalId: journalA.id,
        tagIds: ["anything"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("removeTagFromNote", () => {
  it("detaches the tag but keeps the tag row for reuse", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const [tag] = await a.tagRouter.getAllTags();

    const remaining = await a.tagRouter.removeTagFromNote({
      noteId: note.id,
      tagId: tag!.id,
    });

    expect(remaining).toEqual([]);
    // The tag itself survives, so it stays available in the combobox.
    expect(await testDb.tag.count()).toBe(1);
  });
});
