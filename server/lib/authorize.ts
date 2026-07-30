import { ORPCError } from "@orpc/server";
import type { PrismaClient } from "@/prisma/generated/prisma/client";

export type AuthorizedContext = {
  db: PrismaClient;
  userId: string;
};

/**
 * Confirms the signed-in user owns `journalId` and that the journal is live.
 *
 * We throw NOT_FOUND rather than FORBIDDEN/UNAUTHORIZED on someone else's
 * journal on purpose: FORBIDDEN would confirm that the id exists, turning the
 * endpoint into an id oracle. From the caller's perspective a journal they do
 * not own is indistinguishable from one that was never created.
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
