import { ORPCError } from "@orpc/server";
import { Prisma, type PrismaClient } from "@/prisma/generated/prisma/client";

/**
 * Note access: the one place that says which notes a caller may reach.
 *
 * The rule is "an owned note of a live journal". Opening, saving, renaming and
 * deleting a note all go through here, as do the list queries (via
 * `ownedNoteWhere`) and the share link read (via `liveNoteWhere`, the half of
 * the rule that needs no signed-in user).
 *
 * Anything outside the rule is NOT_FOUND, never FORBIDDEN: FORBIDDEN would
 * confirm the id exists and turn every endpoint into an id oracle. A note in
 * someone else's journal, a note of a trashed journal and a note that was never
 * created are indistinguishable to the caller.
 */

export type NoteAccessContext = {
  db: PrismaClient;
  userId: string;
};

/**
 * A note of a live journal, whoever owns it. The share link read uses this on
 * its own: the token is the credential there, so there is no user to match.
 */
export const liveNoteWhere = {
  journal: { trash: false },
} satisfies Prisma.NoteWhereInput;

/** An owned note of a live journal. List queries spread this into their own `where`. */
export function ownedNoteWhere(userId: string) {
  return {
    journal: { userId, trash: false },
  } satisfies Prisma.NoteWhereInput;
}

/**
 * `ownedNoteWhere` for raw SQL: the note whose journal id is `journalId` is an
 * owned note of a live journal. Self-contained, so it does not depend on the
 * caller having joined "Journal" under any particular alias.
 */
export function ownedNoteSql(userId: string, journalId: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${journalId} IN (
    SELECT "id" FROM "Journal"
    WHERE "userId" = ${userId} AND "trash" = false
  )`;
}

/**
 * The fields of a note that are safe to send to its owner. An explicit select
 * rather than `include`, so adding a column to Note does not silently start
 * shipping it to the browser.
 */
const noteSelect = {
  id: true,
  journalId: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

/** Reads one note in its public shape, or NOT_FOUND. */
export async function findNote(ctx: NoteAccessContext, noteId: string) {
  const note = await ctx.db.note.findFirst({
    where: { id: noteId, ...ownedNoteWhere(ctx.userId) },
    select: noteSelect,
  });

  if (!note) throw new ORPCError("NOT_FOUND");

  return note;
}

/**
 * Writes scalar fields of one note. The ownership predicate rides on the write
 * itself — one round trip, and no window in which the journal could change
 * hands between a check and the update. Zero rows written is NOT_FOUND.
 */
export async function updateNote(
  ctx: NoteAccessContext,
  noteId: string,
  data: Prisma.NoteUpdateManyMutationInput,
) {
  const { count } = await ctx.db.note.updateMany({
    where: { id: noteId, ...ownedNoteWhere(ctx.userId) },
    data,
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}

/** Permanently deletes one note (a note has no trash of its own), or NOT_FOUND. */
export async function deleteNote(ctx: NoteAccessContext, noteId: string) {
  const { count } = await ctx.db.note.deleteMany({
    where: { id: noteId, ...ownedNoteWhere(ctx.userId) },
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}

/**
 * A separate check, for writes that cannot carry the predicate themselves.
 *
 * Only for those: `tags: { connectOrCreate }` and the share link upsert need a
 * `where: { id }` unique target, so the relation filter has to be checked first.
 * Everything else should use `updateNote` / `deleteNote`.
 */
export async function assertNoteOwned(ctx: NoteAccessContext, noteId: string) {
  const note = await ctx.db.note.findFirst({
    where: { id: noteId, ...ownedNoteWhere(ctx.userId) },
    select: { id: true, journalId: true },
  });

  if (!note) throw new ORPCError("NOT_FOUND");

  return note;
}

/**
 * Confirms the signed-in user owns `journalId` and that it is a live journal —
 * for creating a note in it, or listing its notes. NOT_FOUND otherwise, for the
 * same reason as above.
 */
export async function assertJournalOwned(
  ctx: NoteAccessContext,
  journalId: string,
) {
  const journal = await ctx.db.journal.findFirst({
    where: { id: journalId, userId: ctx.userId, trash: false },
    select: { id: true },
  });

  if (!journal) throw new ORPCError("NOT_FOUND");

  return journal;
}
