import { hash } from "@node-rs/argon2";
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

describe("renameTag", () => {
  it("moves a note that already carries both tags without duplicating it", async () => {
    // The load-bearing case for the merge, and the reason it is written first:
    // the whole design rests on Prisma's implicit-m2m `connect` being a no-op
    // for a pair that already exists. If it threw instead, merging would break
    // for exactly the notes most likely to be involved in one.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const both = await makeNote(journal.id, { title: "both" });
    const onlyWork = await makeNote(journal.id, { title: "only work" });

    await a.tagRouter.addTagToNote({ noteId: both.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: both.id, name: "office" });
    await a.tagRouter.addTagToNote({ noteId: onlyWork.id, name: "work" });

    const tags = await a.tagRouter.getAllTags();
    const work = tags.find((t) => t.name === "work")!;
    const office = tags.find((t) => t.name === "office")!;

    const result = await a.tagRouter.renameTag({
      tagId: work.id,
      name: "office",
      merge: true,
    });

    expect(result).toMatchObject({ id: office.id, mergedFrom: work.id });

    // The note that had both ends up with exactly one tag, not two rows of it.
    const bothTags = await a.tagRouter.getTagsForNote({ noteId: both.id });
    expect(bothTags).toEqual([{ id: office.id, name: "office" }]);

    // And the note that only had the old tag was carried over.
    const movedTags = await a.tagRouter.getTagsForNote({ noteId: onlyWork.id });
    expect(movedTags).toEqual([{ id: office.id, name: "office" }]);

    // One surviving tag, holding both notes exactly once each.
    const after = await a.tagRouter.getAllTags();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: office.id, noteCount: 2 });

    // The old row is gone, and its join rows went with it.
    expect(await testDb.tag.count()).toBe(1);
  });

  it("renames a tag and reflects it everywhere it is read", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const [tag] = await a.tagRouter.getAllTags();

    const renamed = await a.tagRouter.renameTag({
      tagId: tag!.id,
      name: "office",
    });

    expect(renamed).toEqual({ id: tag!.id, name: "office", mergedFrom: null });

    const all = await a.tagRouter.getAllTags();
    expect(all).toEqual([{ id: tag!.id, name: "office", noteCount: 1 }]);

    const forNote = await a.tagRouter.getTagsForNote({ noteId: note.id });
    expect(forNote).toEqual([{ id: tag!.id, name: "office" }]);
  });

  it("normalises the new name", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const [tag] = await a.tagRouter.getAllTags();

    const renamed = await a.tagRouter.renameTag({
      tagId: tag!.id,
      name: "  Deep   Work ",
    });

    expect(renamed.name).toBe("deep work");
  });

  it("refuses a name the user already owns, and changes nothing", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const first = await makeNote(journal.id);
    const second = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: first.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: second.id, name: "office" });

    const tags = await a.tagRouter.getAllTags();
    const work = tags.find((t) => t.name === "work")!;
    const office = tags.find((t) => t.name === "office")!;

    await expect(
      a.tagRouter.renameTag({ tagId: work.id, name: "office" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      // Carried so the client can ask "merge 1 note into 'office'?" rather than
      // reporting a refusal the user cannot act on.
      data: {
        reason: "tag-exists",
        existingTagId: office.id,
        noteCount: 1,
      },
    });

    // Nothing moved. A conflict is a question, not a partial write.
    const after = await a.tagRouter.getAllTags();
    expect(after.map((t) => t.name).sort()).toEqual(["office", "work"]);
    expect(after.every((t) => t.noteCount === 1)).toBe(true);
  });

  it("collides on the normalised name, not the typed one", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const first = await makeNote(journal.id);
    const second = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: first.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: second.id, name: "office" });
    const work = (await a.tagRouter.getAllTags()).find(
      (t) => t.name === "work",
    )!;

    // "Office" is not a different name from "office" — which is exactly why a
    // bare rejection would read as a bug.
    await expect(
      a.tagRouter.renameTag({ tagId: work.id, name: "  Office " }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats a rename to the tag's own name as a no-op", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const [tag] = await a.tagRouter.getAllTags();

    // Including the case where only the casing differs, which the client cannot
    // always tell apart before calling.
    const result = await a.tagRouter.renameTag({
      tagId: tag!.id,
      name: "WORK",
    });

    expect(result).toEqual({ id: tag!.id, name: "work", mergedFrom: null });
    expect(await testDb.tag.count()).toBe(1);
  });

  it("does not let one user rename another user's tag", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "mine",
    });
    const [tagA] = await callerFor(USER_A).tagRouter.getAllTags();

    await expect(
      callerFor(USER_B).tagRouter.renameTag({
        tagId: tagA!.id,
        name: "stolen",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Unchanged.
    const [still] = await callerFor(USER_A).tagRouter.getAllTags();
    expect(still!.name).toBe("mine");
  });

  it("lets one user take a name another user already owns", async () => {
    // The unique constraint is on (userId, name), so B owning "work" says
    // nothing about whether A may.
    const journalB = await makeJournal(USER_B);
    const noteB = await makeNote(journalB.id);
    await callerFor(USER_B).tagRouter.addTagToNote({
      noteId: noteB.id,
      name: "work",
    });

    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id);
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "personal",
    });
    const [tagA] = await callerFor(USER_A).tagRouter.getAllTags();

    const renamed = await callerFor(USER_A).tagRouter.renameTag({
      tagId: tagA!.id,
      name: "work",
    });

    expect(renamed).toMatchObject({ name: "work", mergedFrom: null });
    expect(await testDb.tag.count({ where: { name: "work" } })).toBe(2);
  });

  it("rejects an empty or overlong new name", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    const [tag] = await a.tagRouter.getAllTags();

    await expect(
      a.tagRouter.renameTag({ tagId: tag!.id, name: "   " }),
    ).rejects.toBeDefined();

    await expect(
      a.tagRouter.renameTag({ tagId: tag!.id, name: "x".repeat(33) }),
    ).rejects.toBeDefined();
  });

  it("merges tags that share no notes", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const first = await makeNote(journal.id, { title: "first" });
    const second = await makeNote(journal.id, { title: "second" });

    await a.tagRouter.addTagToNote({ noteId: first.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: second.id, name: "office" });

    const tags = await a.tagRouter.getAllTags();
    const work = tags.find((t) => t.name === "work")!;
    const office = tags.find((t) => t.name === "office")!;

    await a.tagRouter.renameTag({
      tagId: work.id,
      name: "office",
      merge: true,
    });

    const after = await a.tagRouter.getAllTags();
    expect(after).toEqual([{ id: office.id, name: "office", noteCount: 2 }]);
  });

  it("merges a tag that has no notes at all", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: note.id, name: "office" });
    const tags = await a.tagRouter.getAllTags();
    const work = tags.find((t) => t.name === "work")!;
    const office = tags.find((t) => t.name === "office")!;

    // Strip the orphan back to zero notes, then merge it.
    await a.tagRouter.removeTagFromNote({ noteId: note.id, tagId: work.id });

    const result = await a.tagRouter.renameTag({
      tagId: work.id,
      name: "office",
      merge: true,
    });

    expect(result).toMatchObject({ id: office.id, mergedFrom: work.id });
    expect(await testDb.tag.count()).toBe(1);
  });
});

describe("getNotesInRange carries tags", () => {
  /** The window every case here uses; the note is created inside it. */
  const range = { start: "2026-07-01", end: "2026-07-31", timeZone: "UTC" };

  it("returns each note's tags, sorted by name", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id, {
      createdAt: new Date("2026-07-15T10:00:00Z"),
    });

    // Added out of order on purpose.
    await a.tagRouter.addTagToNote({ noteId: note.id, name: "work" });
    await a.tagRouter.addTagToNote({ noteId: note.id, name: "admin" });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...range,
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]!.tags.map((t) => t.name)).toEqual(["admin", "work"]);
  });

  it("returns an empty array for an untagged note, never undefined", async () => {
    // The client filter reads `note.tags` unconditionally.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      createdAt: new Date("2026-07-15T10:00:00Z"),
    });

    const notes = await a.notesRouter.getNotesInRange({
      journalId: journal.id,
      ...range,
    });

    expect(notes[0]!.tags).toEqual([]);
  });

  it("still refuses a locked journal", async () => {
    // Tags are one more thing this endpoint now returns, so the gate in front of
    // it has to be re-asserted rather than assumed.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id, {
      createdAt: new Date("2026-07-15T10:00:00Z"),
    });
    await a.tagRouter.addTagToNote({ noteId: note.id, name: "private" });

    await testDb.journal.update({
      where: { id: journal.id },
      data: { hashedPassword: await hash("a-long-enough-password") },
    });

    await expect(
      a.notesRouter.getNotesInRange({ journalId: journal.id, ...range }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { reason: "locked" },
    });
  });

  it("does not leak tags across users", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeNote(journalA.id, {
      createdAt: new Date("2026-07-15T10:00:00Z"),
    });
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteA.id,
      name: "private",
    });

    await expect(
      callerFor(USER_B).notesRouter.getNotesInRange({
        journalId: journalA.id,
        ...range,
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
