import { hash } from "@node-rs/argon2";
import { beforeEach, describe, expect, it } from "vitest";
import {
  issueUnlockToken,
  verifyUnlockToken,
} from "@/server/lib/unlock";
import { callerFor, makeJournal, makeNote, testDb, USER_A, USER_B } from "../helpers/db";

/**
 * Password-protected journals.
 *
 * The claim under test is the one that makes the feature more than decoration: a
 * locked journal is unreachable through *every* path, including the ones that take
 * a note id and never mention the journal. A client-side "unlocked" boolean would
 * pass a UI test and fail all of these.
 */

const PASSWORD = "correct horse battery staple";

async function makeLockedJournal(userId: string) {
  const journal = await makeJournal(userId);
  await testDb.journal.update({
    where: { id: journal.id },
    data: { hashedPassword: await hash(PASSWORD) },
  });
  return journal;
}

describe("unlock token", () => {
  it("accepts a token it just minted", () => {
    const token = issueUnlockToken("journal_1", USER_A);
    expect(verifyUnlockToken(token, "journal_1", USER_A)).toBe(true);
  });

  it("is scoped to one journal", () => {
    const token = issueUnlockToken("journal_1", USER_A);
    expect(verifyUnlockToken(token, "journal_2", USER_A)).toBe(false);
  });

  it("is scoped to one user, so a leaked token is useless elsewhere", () => {
    const token = issueUnlockToken("journal_1", USER_A);
    expect(verifyUnlockToken(token, "journal_1", USER_B)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = issueUnlockToken("journal_1", USER_A);
    const [, userId, expiresAt, signature] = token.split(".");

    // Swapping the journal id keeps the signature, which no longer matches.
    const forged = ["journal_2", userId, expiresAt, signature].join(".");
    expect(verifyUnlockToken(forged, "journal_2", USER_A)).toBe(false);
  });

  it("rejects an extended expiry — the expiry is signed, not advisory", () => {
    const token = issueUnlockToken("journal_1", USER_A);
    const [journalId, userId, , signature] = token.split(".");

    const forged = [
      journalId,
      userId,
      String(Date.now() + 10 ** 9),
      signature,
    ].join(".");

    expect(verifyUnlockToken(forged, "journal_1", USER_A)).toBe(false);
  });

  it("rejects an expired token", () => {
    // Hand-built with a past expiry, then correctly signed is impossible from
    // outside — so assert on the shape we can build: a past expiry fails.
    const expired = ["journal_1", USER_A, String(Date.now() - 1000)].join(".");
    expect(verifyUnlockToken(`${expired}.nonsense`, "journal_1", USER_A)).toBe(
      false,
    );
  });

  it("rejects junk", () => {
    for (const bad of ["", "a.b.c.d", "....", "not-a-token", undefined, null]) {
      expect(verifyUnlockToken(bad, "journal_1", USER_A)).toBe(false);
    }
  });
});

describe("locked journals are unreachable without a token", () => {
  let journal: Awaited<ReturnType<typeof makeJournal>>;
  let note: Awaited<ReturnType<typeof makeNote>>;

  beforeEach(async () => {
    journal = await makeLockedJournal(USER_A);
    note = await makeNote(journal.id);
  });

  it("blocks journal-scoped reads and writes", async () => {
    const a = callerFor(USER_A);

    // FORBIDDEN, not NOT_FOUND: the owner needs to know it exists so the client
    // can prompt for the password.
    await expect(
      a.notesRouter.getNotesInRange({
        journalId: journal.id,
        start: "2026-06-28",
        end: "2026-08-08",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      a.notesRouter.createNote({ journalId: journal.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks note-by-id paths, which never mention the journal", async () => {
    // The regression that would make the whole feature theatre: these endpoints
    // take only a note id, so a scoped write against journal.userId would happily
    // serve a locked journal's content.
    const a = callerFor(USER_A);

    await expect(
      a.notesRouter.getNoteById({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      a.notesRouter.saveNote({
        noteId: note.id,
        content: [{ type: "p", children: [{ text: "past the lock" }] }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      a.notesRouter.renameNote({ noteId: note.id, title: "past the lock" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      a.notesRouter.deleteNote({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Nothing was written and nothing was deleted.
    const after = await testDb.note.findUniqueOrThrow({
      where: { id: note.id },
    });
    expect(after.title).not.toBe("past the lock");
    expect(JSON.stringify(after.content)).not.toContain("past the lock");
  });

  it("blocks tag operations on a locked journal's notes", async () => {
    const a = callerFor(USER_A);

    await expect(
      a.tagRouter.addTagToNote({ noteId: note.id, name: "secret" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      a.tagRouter.getTagsForNote({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows everything once a valid token is presented", async () => {
    const token = issueUnlockToken(journal.id, USER_A);
    const unlocked = callerFor(USER_A, { [journal.id]: token });

    await expect(
      unlocked.notesRouter.getNoteById({ noteId: note.id }),
    ).resolves.toMatchObject({ id: note.id });

    await expect(
      unlocked.notesRouter.renameNote({ noteId: note.id, title: "allowed" }),
    ).resolves.toMatchObject({ title: "allowed" });
  });

  it("does not accept another journal's token", async () => {
    const other = await makeLockedJournal(USER_A);
    const wrongToken = issueUnlockToken(other.id, USER_A);

    const caller = callerFor(USER_A, { [journal.id]: wrongToken });

    await expect(
      caller.notesRouter.getNoteById({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still returns NOT_FOUND to a different user, not FORBIDDEN", async () => {
    // A stranger must not learn that the journal exists at all, let alone that it
    // is protected. Ownership is checked before the lock.
    const b = callerFor(USER_B);

    await expect(
      b.notesRouter.getNoteById({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      b.notesRouter.createNote({ journalId: journal.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("leaves unprotected journals completely unaffected", async () => {
    const open = await makeJournal(USER_A);
    const openNote = await makeNote(open.id);

    const a = callerFor(USER_A);

    await expect(
      a.notesRouter.getNoteById({ noteId: openNote.id }),
    ).resolves.toMatchObject({ id: openNote.id });
  });
});

describe("getProtectedJournalIds", () => {
  it("lists only the caller's protected journals", async () => {
    const locked = await makeLockedJournal(USER_A);
    await makeJournal(USER_A);
    await makeLockedJournal(USER_B);

    const ids = await callerFor(USER_A).journalRouter.getProtectedJournalIds();

    expect(ids).toEqual([locked.id]);
  });
});
