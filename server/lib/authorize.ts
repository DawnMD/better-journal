import { ORPCError } from "@orpc/server";
import type { PrismaClient } from "@/prisma/generated/prisma/client";

export type AuthorizedContext = {
  db: PrismaClient;
  userId: string;
};

/**
 * Confirms the signed-in user owns `journalId` and that the journal is live.
 *
 * NOT_FOUND rather than FORBIDDEN for a journal that is not theirs: FORBIDDEN
 * would confirm the id exists, turning the endpoint into an id oracle. A journal
 * they do not own is indistinguishable from one that was never created.
 */
export async function assertJournalOwned(
  ctx: AuthorizedContext,
  journalId: string,
) {
  const journal = await ctx.db.journal.findFirst({
    where: { id: journalId, userId: ctx.userId, trash: false },
    select: { id: true },
  });

  if (!journal) throw new ORPCError("NOT_FOUND");

  return journal;
}

/**
 * Confirms the signed-in user owns the journal that `noteId` belongs to.
 *
 * For procedures that only receive a note id and cannot express ownership as a
 * predicate on their own write — `tags: { connectOrCreate }` needs a
 * `where: { id }` unique target, so the relation filter has to be checked
 * separately. Where a scoped `updateMany` *can* carry the predicate, prefer that
 * instead: it is one round trip and leaves no TOCTOU window.
 */
export async function assertNoteOwned(ctx: AuthorizedContext, noteId: string) {
  const note = await ctx.db.note.findFirst({
    where: {
      id: noteId,
      journal: { userId: ctx.userId, trash: false },
    },
    select: { id: true, journalId: true },
  });

  if (!note) throw new ORPCError("NOT_FOUND");

  return { id: note.id, journalId: note.journalId };
}
