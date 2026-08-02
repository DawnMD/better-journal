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
 * Public share links.
 *
 * This is the one router that answers without a session, so it gets the closest
 * reading. Two questions run through every case: can a token reach anything it
 * was not given, and does an anonymous read return one byte more than the entry
 * itself. The rest — revoke, trash, delete — are all the same question asked
 * about *when* a link stops working.
 */

const asA = () => callerFor(USER_A);
const asB = () => callerFor(USER_B);
const asAnon = () => callerFor(null);

async function expectOrpcError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("shareRouter — reading a shared note", () => {
  let journalA: Awaited<ReturnType<typeof makeJournal>>;
  let noteA: Awaited<ReturnType<typeof makeNote>>;

  beforeEach(async () => {
    journalA = await makeJournal(USER_A);
    noteA = await makeNote(journalA.id, {
      title: "A shared entry",
      content: [{ type: "p", children: [{ text: "hello from A" }] }],
    });
  });

  it("lets a stranger with the token read the entry", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    const shared = await asAnon().shareRouter.getSharedNote({ token });

    expect(shared.title).toBe("A shared entry");
    expect(JSON.stringify(shared.content)).toContain("hello from A");
  });

  it("returns the entry and nothing else", async () => {
    // The guard on the explicit select in getSharedNote. A journalId here would
    // be an id to try elsewhere; a userId would name the author of a private
    // journal to whoever the link was forwarded to.
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    const shared = await asAnon().shareRouter.getSharedNote({ token });

    expect(Object.keys(shared).sort()).toEqual([
      "content",
      "createdAt",
      "title",
    ]);
  });

  it("shows edits made after the link was sent", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await asA().notesRouter.saveNote({
      noteId: noteA.id,
      content: [{ type: "p", children: [{ text: "second draft" }] }],
    });

    const shared = await asAnon().shareRouter.getSharedNote({ token });
    expect(JSON.stringify(shared.content)).toContain("second draft");
  });

  it("refuses a token that was never issued", async () => {
    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token: "not-a-real-token" }),
      "NOT_FOUND",
    );
  });

  it("does not treat a note id as a token", async () => {
    // The share table is keyed by a secret, not by the note's own id. Passing the
    // id must not be a way in even for a note that is genuinely shared.
    await asA().shareRouter.createShareLink({ noteId: noteA.id });

    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token: noteA.id }),
      "NOT_FOUND",
    );
  });

  it("issues tokens that are unguessable and unique per note", async () => {
    const second = await makeNote(journalA.id);

    const first = await asA().shareRouter.createShareLink({ noteId: noteA.id });
    const other = await asA().shareRouter.createShareLink({
      noteId: second.id,
    });

    expect(first.token).not.toBe(other.token);
    // 32 bytes of base64url. Short enough to check, long enough that the check
    // fails loudly if someone swaps in a cuid.
    expect(first.token).toMatch(/^[\w-]{43}$/);
  });
});

describe("shareRouter — who may share", () => {
  let journalA: Awaited<ReturnType<typeof makeJournal>>;
  let noteA: Awaited<ReturnType<typeof makeNote>>;

  beforeEach(async () => {
    journalA = await makeJournal(USER_A);
    noteA = await makeNote(journalA.id);
  });

  it("refuses to publish another user's note", async () => {
    await expectOrpcError(
      asB().shareRouter.createShareLink({ noteId: noteA.id }),
      "NOT_FOUND",
    );

    expect(await testDb.noteShare.count()).toBe(0);
  });

  it("does not tell another user whether a note is shared", async () => {
    await asA().shareRouter.createShareLink({ noteId: noteA.id });

    // NOT_FOUND rather than `null`: answering "no link" would confirm the note
    // exists, and answering truthfully would hand over the token itself.
    await expectOrpcError(
      asB().shareRouter.getShareLink({ noteId: noteA.id }),
      "NOT_FOUND",
    );
  });

  it("refuses to revoke another user's link", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await expectOrpcError(
      asB().shareRouter.revokeShareLink({ noteId: noteA.id }),
      "NOT_FOUND",
    );

    // Still live.
    await expect(
      asAnon().shareRouter.getSharedNote({ token }),
    ).resolves.toBeTruthy();
  });

  it("refuses anonymous callers on every owner-side procedure", async () => {
    await expectOrpcError(
      asAnon().shareRouter.createShareLink({ noteId: noteA.id }),
      "UNAUTHORIZED",
    );
    await expectOrpcError(
      asAnon().shareRouter.getShareLink({ noteId: noteA.id }),
      "UNAUTHORIZED",
    );
    await expectOrpcError(
      asAnon().shareRouter.revokeShareLink({ noteId: noteA.id }),
      "UNAUTHORIZED",
    );
  });

  it("hands back the same link when the owner shares twice", async () => {
    const first = await asA().shareRouter.createShareLink({ noteId: noteA.id });
    const again = await asA().shareRouter.createShareLink({ noteId: noteA.id });

    expect(again.token).toBe(first.token);
    expect(await testDb.noteShare.count({ where: { noteId: noteA.id } })).toBe(
      1,
    );
  });

  it("reports the link to its owner, and null when there is none", async () => {
    await expect(
      asA().shareRouter.getShareLink({ noteId: noteA.id }),
    ).resolves.toBeNull();

    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await expect(
      asA().shareRouter.getShareLink({ noteId: noteA.id }),
    ).resolves.toMatchObject({ token });
  });
});

describe("shareRouter — when a link stops working", () => {
  let journalA: Awaited<ReturnType<typeof makeJournal>>;
  let noteA: Awaited<ReturnType<typeof makeNote>>;

  beforeEach(async () => {
    journalA = await makeJournal(USER_A);
    noteA = await makeNote(journalA.id);
  });

  it("goes dead the moment the owner revokes it", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await asA().shareRouter.revokeShareLink({ noteId: noteA.id });

    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token }),
      "NOT_FOUND",
    );
  });

  it("issues a genuinely new token after a revoke", async () => {
    const first = await asA().shareRouter.createShareLink({ noteId: noteA.id });
    await asA().shareRouter.revokeShareLink({ noteId: noteA.id });
    const second = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    // The revoked URL must not come back to life just because the owner shared
    // again — someone was told that link was dead.
    expect(second.token).not.toBe(first.token);
    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token: first.token }),
      "NOT_FOUND",
    );
  });

  it("treats revoking an unshared note as a success", async () => {
    await expect(
      asA().shareRouter.revokeShareLink({ noteId: noteA.id }),
    ).resolves.toMatchObject({ noteId: noteA.id });
  });

  it("goes dark while the journal is in the trash, and returns when restored", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await asA().journalRouter.moveToTrash({ id: journalA.id });

    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token }),
      "NOT_FOUND",
    );

    await asA().journalRouter.removeFromTrash({ id: journalA.id });

    await expect(
      asAnon().shareRouter.getSharedNote({ token }),
    ).resolves.toBeTruthy();
  });

  it("is deleted along with its note", async () => {
    const { token } = await asA().shareRouter.createShareLink({
      noteId: noteA.id,
    });

    await asA().notesRouter.deleteNote({ noteId: noteA.id });

    // The FK cascade, not a cleanup pass: a note that is gone cannot leave a
    // readable link behind.
    expect(await testDb.noteShare.count()).toBe(0);
    await expectOrpcError(
      asAnon().shareRouter.getSharedNote({ token }),
      "NOT_FOUND",
    );
  });
});
