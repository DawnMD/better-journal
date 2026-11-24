import { describe, expect, it } from "vitest";
import {
  findJournal,
  listLiveJournals,
  listTrashedJournals,
  purgeJournal,
  restoreJournal,
  trashJournal,
} from "@/server/lib/journal-access";
import { makeJournal, makeNote, testDb, USER_A, USER_B } from "../helpers/db";

/**
 * The journal trash lifecycle, tested once against the module.
 *
 * A live journal can be trashed; a trashed journal can be restored or purged;
 * nothing else. Every move outside that — and every move on a journal that is
 * someone else's or was never created — answers NOT_FOUND, never FORBIDDEN, so
 * ids cannot be probed. The router only wires procedures to this module; its
 * tests check that wiring, not the matrix.
 */

const as = (userId: string) => ({ db: testDb, userId });

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
}

async function trashState(journalId: string) {
  const journal = await testDb.journal.findUnique({ where: { id: journalId } });
  return journal?.trash;
}

describe("journal access — moves a live journal cannot make", () => {
  it("purging a live journal is NOT_FOUND and deletes nothing", async () => {
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id);

    await expectNotFound(purgeJournal(as(USER_A), journal.id));

    expect(await testDb.journal.count({ where: { id: journal.id } })).toBe(1);
    expect(await testDb.note.count({ where: { journalId: journal.id } })).toBe(
      1,
    );
  });

  it("restoring a journal that is not trashed is NOT_FOUND", async () => {
    const journal = await makeJournal(USER_A);

    await expectNotFound(restoreJournal(as(USER_A), journal.id));
  });
});

describe("journal access — moves a trashed journal cannot make", () => {
  it("trashing a trashed journal is NOT_FOUND", async () => {
    const journal = await makeJournal(USER_A, { trash: true });

    await expectNotFound(trashJournal(as(USER_A), journal.id));
  });
});

describe("journal access — the lifecycle for the owner", () => {
  it("trash moves a live journal to the trash", async () => {
    const journal = await makeJournal(USER_A);

    await trashJournal(as(USER_A), journal.id);

    expect(await trashState(journal.id)).toBe(true);
  });

  it("restore brings a trashed journal back to life", async () => {
    const journal = await makeJournal(USER_A, { trash: true });

    await restoreJournal(as(USER_A), journal.id);

    expect(await trashState(journal.id)).toBe(false);
  });

  it("purge deletes a trashed journal and all its notes", async () => {
    const journal = await makeJournal(USER_A, { trash: true });
    await makeNote(journal.id);
    await makeNote(journal.id);

    await purgeJournal(as(USER_A), journal.id);

    expect(await testDb.journal.count({ where: { id: journal.id } })).toBe(0);
    expect(await testDb.note.count({ where: { journalId: journal.id } })).toBe(
      0,
    );
  });
});

describe("journal access — a foreign or nonexistent journal", () => {
  it("every move is NOT_FOUND and changes nothing", async () => {
    const live = await makeJournal(USER_B);
    const trashed = await makeJournal(USER_B, { trash: true });

    await expectNotFound(trashJournal(as(USER_A), live.id));
    await expectNotFound(restoreJournal(as(USER_A), trashed.id));
    await expectNotFound(purgeJournal(as(USER_A), trashed.id));

    expect(await trashState(live.id)).toBe(false);
    expect(await trashState(trashed.id)).toBe(true);

    await expectNotFound(trashJournal(as(USER_A), "cuid_does_not_exist"));
    await expectNotFound(restoreJournal(as(USER_A), "cuid_does_not_exist"));
    await expectNotFound(purgeJournal(as(USER_A), "cuid_does_not_exist"));
  });
});

describe("journal access — reading one journal", () => {
  it("find returns an owned live journal in its public shape", async () => {
    const journal = await makeJournal(USER_A, {
      title: "Mine",
      description: "about",
    });

    const found = await findJournal(as(USER_A), journal.id);

    expect(found.id).toBe(journal.id);
    expect(found.title).toBe("Mine");
    expect(found.description).toBe("about");
    expect(Object.keys(found).sort()).toEqual([
      "createdAt",
      "description",
      "id",
      "title",
      "trash",
      "updatedAt",
      "userId",
    ]);
  });

  it("find is NOT_FOUND for a missing, foreign or trashed journal", async () => {
    const foreign = await makeJournal(USER_B);
    const trashed = await makeJournal(USER_A, { trash: true });

    await expectNotFound(findJournal(as(USER_A), "cuid_does_not_exist"));
    await expectNotFound(findJournal(as(USER_A), foreign.id));
    await expectNotFound(findJournal(as(USER_A), trashed.id));
  });
});

describe("journal access — listing", () => {
  it("lists only the caller's live journals, most recently updated first", async () => {
    const older = await makeJournal(USER_A, { title: "older" });
    const newer = await makeJournal(USER_A, { title: "newer" });
    await testDb.journal.update({
      where: { id: newer.id },
      data: { title: "newer!" },
    });
    await makeJournal(USER_A, { trash: true });
    await makeJournal(USER_B);

    const live = await listLiveJournals(as(USER_A));

    expect(live.map((journal) => journal.id)).toEqual([newer.id, older.id]);
  });

  it("lists only the caller's trashed journals, with their notes", async () => {
    const trashed = await makeJournal(USER_A, { trash: true });
    const note = await makeNote(trashed.id, { title: "kept" });
    await makeJournal(USER_A);
    await makeJournal(USER_B, { trash: true });

    const inTrash = await listTrashedJournals(as(USER_A));

    expect(inTrash.map((journal) => journal.id)).toEqual([trashed.id]);
    expect(inTrash[0]?.notes.map((n) => n.id)).toEqual([note.id]);
  });
});
