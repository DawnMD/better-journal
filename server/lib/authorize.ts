import { ORPCError } from "@orpc/server";
import type { PrismaClient } from "@/prisma/generated/prisma/client";
import { verifyUnlockToken } from "./unlock";

export type AuthorizedContext = {
  db: PrismaClient;
  userId: string;
  /** Supplied by the request context; absent in tests that do not exercise unlocking. */
  unlockToken?: (journalId: string) => string | undefined;
};

/**
 * Confirms the signed-in user owns `journalId`, that the journal is live, and —
 * if it is password-protected — that this request carries a valid unlock token.
 *
 * Two different failures, two different codes, on purpose:
 *
 *  - NOT_FOUND for a journal that is not theirs. FORBIDDEN would confirm the id
 *    exists, turning the endpoint into an id oracle. A journal they do not own is
 *    indistinguishable from one that was never created.
 *  - FORBIDDEN (`reason: "locked"`) for their *own* locked journal. Here the
 *    client genuinely needs to tell the two apart so it can show the unlock
 *    prompt, and hiding the journal's existence from its owner would just make it
 *    permanently unopenable.
 */
export async function assertJournalOwned(
  ctx: AuthorizedContext,
  journalId: string,
) {
  const journal = await ctx.db.journal.findFirst({
    where: { id: journalId, userId: ctx.userId, trash: false },
    select: { id: true, hashedPassword: true },
  });

  if (!journal) throw new ORPCError("NOT_FOUND");

  assertUnlocked(ctx, journalId, journal.hashedPassword);

  return journal;
}

/**
 * Throws unless `journalId` is unprotected, or this request carries a live unlock
 * token for it.
 *
 * Synchronous and takes the hash as an argument so callers that are *already*
 * reading the note or journal can select `hashedPassword` in that same query and
 * check the lock without a second round trip.
 *
 * This is the enforcement point that makes the feature real. Every path that can
 * reach note content — including the ones that resolve a note by its own id and
 * never mention the journal — has to come through here, or the password is
 * decoration that the RPC layer happily ignores.
 */
export function assertUnlocked(
  ctx: AuthorizedContext,
  journalId: string,
  hashedPassword: string | null,
) {
  if (!hashedPassword) return;

  const token = ctx.unlockToken?.(journalId);

  if (!verifyUnlockToken(token, journalId, ctx.userId)) {
    throw new ORPCError("FORBIDDEN", {
      message: "This journal is locked.",
      data: { reason: "locked" as const },
    });
  }
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
    // The journal's lock state comes back in the same query, so the unlock check
    // costs nothing extra.
    select: {
      id: true,
      journalId: true,
      journal: { select: { hashedPassword: true } },
    },
  });

  if (!note) throw new ORPCError("NOT_FOUND");

  assertUnlocked(ctx, note.journalId, note.journal.hashedPassword);

  return { id: note.id, journalId: note.journalId };
}
