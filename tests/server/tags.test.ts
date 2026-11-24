import { describe, expect, it } from "vitest";
import { Prisma } from "@/prisma/generated/prisma/client";
import { assertTagsOwned, hasEveryTagSql } from "@/server/lib/tags";
import { makeJournal, makeNote, testDb, USER_A, USER_B } from "../helpers/db";

/**
 * The tag module, tested once against the module. The routers only wire
 * procedures to it; their own tests check that wiring.
 */

const as = (userId: string) => ({ db: testDb, userId });

async function makeTag(userId: string, name: string) {
  return testDb.tag.create({ data: { userId, name }, select: { id: true } });
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
}

describe("tag ownership — every named tag id must be owned", () => {
  it("accepts tags the caller owns", async () => {
    const work = await makeTag(USER_A, "work");
    const urgent = await makeTag(USER_A, "urgent");

    await expect(
      assertTagsOwned(as(USER_A), [work.id, urgent.id]),
    ).resolves.toBeUndefined();
  });

  it("accepts the same owned id named twice", async () => {
    const work = await makeTag(USER_A, "work");

    await expect(
      assertTagsOwned(as(USER_A), [work.id, work.id]),
    ).resolves.toBeUndefined();
  });

  it("accepts an empty set", async () => {
    await expect(assertTagsOwned(as(USER_A), [])).resolves.toBeUndefined();
  });

  it("is NOT_FOUND for another user's tag", async () => {
    const theirs = await makeTag(USER_B, "work");

    await expectNotFound(assertTagsOwned(as(USER_A), [theirs.id]));
  });

  it("is NOT_FOUND for a tag that does not exist", async () => {
    await expectNotFound(
      assertTagsOwned(as(USER_A), ["cnonexistenttagidaaaaaaaa"]),
    );
  });

  it("is NOT_FOUND when any one of several ids is not owned", async () => {
    const mine = await makeTag(USER_A, "work");
    const theirs = await makeTag(USER_B, "work");

    await expectNotFound(assertTagsOwned(as(USER_A), [mine.id, theirs.id]));
  });
});

describe("has every tag — the raw SQL tag filter", () => {
  /** Titles of every note passing the fragment, keyed on the outer note's id. */
  async function titlesWithEveryTag(tagIds: string[]) {
    const rows = await testDb.$queryRaw<{ title: string }[]>`
      SELECT n."title" FROM "Note" n
      WHERE ${hasEveryTagSql(Prisma.raw(`n."id"`), tagIds)}
      ORDER BY n."title"
    `;

    return rows.map((row) => row.title);
  }

  async function tagged(title: string, tagIds: string[], journalId: string) {
    const note = await makeNote(journalId, { title });
    await testDb.note.update({
      where: { id: note.id },
      data: { tags: { connect: tagIds.map((id) => ({ id })) } },
    });
  }

  it("keeps only notes carrying every tag (AND, not OR)", async () => {
    const journal = await makeJournal(USER_A);
    const work = await makeTag(USER_A, "work");
    const urgent = await makeTag(USER_A, "urgent");

    await tagged("both", [work.id, urgent.id], journal.id);
    await tagged("only work", [work.id], journal.id);
    await tagged("only urgent", [urgent.id], journal.id);
    await tagged("none", [], journal.id);

    expect(await titlesWithEveryTag([work.id])).toEqual(["both", "only work"]);
    expect(await titlesWithEveryTag([work.id, urgent.id])).toEqual(["both"]);
  });

  it("passes every note when no tags are named", async () => {
    const journal = await makeJournal(USER_A);
    const work = await makeTag(USER_A, "work");

    await tagged("tagged", [work.id], journal.id);
    await tagged("untagged", [], journal.id);

    expect(await titlesWithEveryTag([])).toEqual(["tagged", "untagged"]);
  });

  it("counts a tag named twice once", async () => {
    const journal = await makeJournal(USER_A);
    const work = await makeTag(USER_A, "work");

    await tagged("tagged", [work.id], journal.id);

    expect(await titlesWithEveryTag([work.id, work.id])).toEqual(["tagged"]);
  });
});
