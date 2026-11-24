import { ORPCError } from "@orpc/server";
import { Prisma } from "@/prisma/generated/prisma/client";
import type { NoteAccessContext } from "./note-access";

/**
 * The tag module: the one place that says which tags a caller may name, how a
 * tag is renamed, and what "a note carrying every one of these tags" means.
 *
 * A tag id that is not the caller's is NOT_FOUND, never FORBIDDEN, for the same
 * reason as in note-access.ts: FORBIDDEN would confirm the id exists.
 */

/** A tag owned by `userId`. */
function ownedTagWhere(userId: string) {
  return { userId } satisfies Prisma.TagWhereInput;
}

/**
 * How a note's tags are sent to the client everywhere: id and name, by name.
 * Spread as `tags: tagSummary` into a note `select`.
 */
export const tagSummary = {
  select: { id: true, name: true },
  orderBy: { name: "asc" },
} satisfies Prisma.Note$tagsArgs;

/**
 * Confirms every id in `tagIds` names a tag the caller owns, or NOT_FOUND.
 *
 * Duplicates are fine — the ids are de-duplicated before counting, so naming a
 * tag twice is not mistaken for naming someone else's.
 */
export async function assertTagsOwned(
  ctx: NoteAccessContext,
  tagIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(tagIds)];

  if (unique.length === 0) return;

  const owned = await ctx.db.tag.count({
    where: { id: { in: unique }, ...ownedTagWhere(ctx.userId) },
  });

  if (owned !== unique.length) throw new ORPCError("NOT_FOUND");
}

/** Every tag the caller owns, with how many notes carry it, by name. */
export async function listTags(ctx: NoteAccessContext) {
  const tags = await ctx.db.tag.findMany({
    where: ownedTagWhere(ctx.userId),
    select: { id: true, name: true, _count: { select: { notes: true } } },
    orderBy: { name: "asc" },
  });

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    noteCount: tag._count.notes,
  }));
}

/**
 * Attaches a tag, by (already normalised) name, to a note the caller has
 * reached through note access, creating the tag if the caller does not have it
 * yet. Returns the note's tags.
 *
 * `connectOrCreate` on the ([userId, name]) unique constraint, so two rapid
 * requests for the same new tag cannot produce a duplicate — Postgres
 * arbitrates rather than a read-then-write in application code.
 */
export async function addTagToNote(
  ctx: NoteAccessContext,
  noteId: string,
  name: string,
) {
  const note = await ctx.db.note.update({
    where: { id: noteId },
    data: {
      tags: {
        connectOrCreate: {
          where: { userId_name: { userId: ctx.userId, name } },
          create: { name, userId: ctx.userId },
        },
      },
    },
    select: { tags: tagSummary },
  });

  return note.tags;
}

/**
 * Detaches an owned tag from a note the caller has reached through note
 * access. Returns the note's tags.
 *
 * The tag must also be the caller's. Without the check a caller could detach
 * another user's tag row from their own note, which is harmless in effect but
 * still an operation on someone else's data.
 */
export async function removeTagFromNote(
  ctx: NoteAccessContext,
  noteId: string,
  tagId: string,
) {
  await assertTagsOwned(ctx, [tagId]);

  const note = await ctx.db.note.update({
    where: { id: noteId },
    data: { tags: { disconnect: { id: tagId } } },
    select: { tags: tagSummary },
  });

  return note.tags;
}

/** The caller's tags on one note, by name. */
export function tagsOfNote(ctx: NoteAccessContext, noteId: string) {
  return ctx.db.tag.findMany({
    where: { ...ownedTagWhere(ctx.userId), notes: { some: { id: noteId } } },
    ...tagSummary,
  });
}

/** Permanently deletes an owned tag; its join rows go via ON DELETE CASCADE. */
export async function deleteTag(ctx: NoteAccessContext, tagId: string) {
  const { count } = await ctx.db.tag.deleteMany({
    where: { id: tagId, ...ownedTagWhere(ctx.userId) },
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}

/**
 * Postgres' unique-constraint violation, as Prisma reports it.
 *
 * Matched on the code rather than by `instanceof`: the generated client's error
 * classes are not worth importing for one branch, and `P2002` is stable API.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Renames an owned tag to an (already normalised) name, or merges it into the
 * tag that already has that name when `merge` is true.
 *
 * The awkward case is a rename onto a name the user already owns. Rejecting it
 * outright reads as a bug — names are normalised, so "Office" and "office" are
 * indistinguishable on screen and the refusal would look arbitrary. Merging
 * silently is worse: it destroys a tag, and everything it was attached to, on
 * a keystroke. So the conflict comes back as a `CONFLICT` carrying the
 * survivor's id and how many notes it holds, which is enough for the client to
 * ask "merge 12 notes into 'office'?" and call again with `merge: true`.
 */
export async function renameTag(
  ctx: NoteAccessContext,
  tagId: string,
  name: string,
  merge: boolean,
) {
  const tag = await ctx.db.tag.findFirst({
    where: { id: tagId, ...ownedTagWhere(ctx.userId) },
    select: { id: true, name: true },
  });

  if (!tag) throw new ORPCError("NOT_FOUND");

  // Renaming to the name it already has. Not a conflict with itself, and not
  // worth a write; the client's dialog can't always tell, since it compares a
  // raw draft against a normalised name.
  if (tag.name === name) {
    return { id: tag.id, name: tag.name, mergedFrom: null };
  }

  // One rename path, tried at most twice. A concurrent request can create the
  // name between the lookup and the write; Postgres arbitrates via the
  // ([userId, name]) unique constraint — the same stance as `connectOrCreate`
  // above — and the second pass finds that tag and takes the conflict path
  // rather than reporting a 500. If the racing creator also deleted it again,
  // the second pass sees the name free and renames.
  for (let attempt = 1; ; attempt++) {
    const survivor = await ctx.db.tag.findFirst({
      where: { ...ownedTagWhere(ctx.userId), name },
      select: { id: true, _count: { select: { notes: true } } },
    });

    if (survivor) {
      return mergeInto(ctx, tag.id, survivor, name, merge);
    }

    try {
      const renamed = await ctx.db.tag.update({
        where: { id: tag.id },
        data: { name },
        select: { id: true, name: true },
      });

      return { ...renamed, mergedFrom: null };
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 2) throw error;
    }
  }
}

/** The conflict half of `renameTag`: refuse with CONFLICT, or merge. */
async function mergeInto(
  ctx: NoteAccessContext,
  fromTagId: string,
  survivor: { id: string; _count: { notes: number } },
  name: string,
  merge: boolean,
) {
  if (!merge) {
    throw new ORPCError("CONFLICT", {
      data: {
        reason: "tag-exists" as const,
        existingTagId: survivor.id,
        noteCount: survivor._count.notes,
      },
    });
  }

  await ctx.db.$transaction(async (tx) => {
    const notes = await tx.note.findMany({
      where: { tags: { some: { id: fromTagId } } },
      select: { id: true },
    });

    // Connect *before* the delete: the delete cascades the old tag's join rows
    // away, so doing it first would lose the list of notes to move. `connect`
    // on a pair that already exists is a no-op, so a note carrying both tags
    // ends up with exactly one join row, not a duplicate-key error.
    if (notes.length > 0) {
      await tx.tag.update({
        where: { id: survivor.id },
        data: { notes: { connect: notes.map(({ id }) => ({ id })) } },
      });
    }

    await tx.tag.delete({ where: { id: fromTagId } });
  });

  return { id: survivor.id, name, mergedFrom: fromTagId };
}

/**
 * Raw SQL: the note whose id is `noteId` carries *every* tag in `tagIds`. With
 * no tags it passes every note, so callers can always include it.
 *
 * AND semantics, matching `hasAllTags` in lib/tags.ts, expressed by counting a
 * note's matched join rows and requiring all of them. In `_NoteToTag`, "A" is
 * the Note and "B" is the Tag — per the foreign keys in the add_tags migration,
 * and reversing them returns zero rows silently rather than failing. The
 * `_NoteToTag_B_index` index serves the `B = ANY(...)` scan.
 *
 * It does not check ownership: pair it with `assertTagsOwned` so an id that is
 * not the caller's is refused rather than silently matching nothing.
 */
export function hasEveryTagSql(
  noteId: Prisma.Sql,
  tagIds: readonly string[],
): Prisma.Sql {
  const unique = [...new Set(tagIds)];

  if (unique.length === 0) return Prisma.sql`TRUE`;

  return Prisma.sql`${noteId} IN (
    SELECT nt."A"
    FROM "_NoteToTag" nt
    WHERE nt."B" = ANY(${unique}::text[])
    GROUP BY nt."A"
    HAVING count(*) = ${unique.length}::int
  )`;
}
