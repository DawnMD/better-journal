import { ORPCError } from "@orpc/server";
import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";

/**
 * Journal access: the one place that says which journals a caller may reach,
 * and the journal trash lifecycle.
 *
 * The lifecycle is explicit: a live journal can be trashed, a trashed journal
 * can be restored or purged, and nothing else. Each move carries the state it
 * starts from in its own `where`, so a move from the wrong state matches no row
 * and answers NOT_FOUND — the same answer as someone else's journal or one that
 * never existed. Never FORBIDDEN, for the reason given in note-access.ts: it
 * would confirm the id exists.
 */

export type JournalAccessContext = {
  db: PrismaClient;
  userId: string;
};

/** An owned live journal. */
function liveJournalWhere(userId: string) {
  return { userId, trash: false } satisfies Prisma.JournalWhereInput;
}

/** An owned trashed journal. */
function trashedJournalWhere(userId: string) {
  return { userId, trash: true } satisfies Prisma.JournalWhereInput;
}

/**
 * The journal columns that are safe to send to a browser. Spelled out rather
 * than left to Prisma's default "every scalar", so adding a column to the model
 * does not silently start shipping it to the client.
 */
const journalSelect = {
  id: true,
  title: true,
  description: true,
  userId: true,
  trash: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JournalSelect;

/**
 * The caller's live journals. Without an explicit order Postgres is free to
 * return rows in any order, which reshuffles the sidebar between renders; this
 * ordering is what @@index([userId, trash, updatedAt]) exists to serve.
 */
export async function listLiveJournals(ctx: JournalAccessContext) {
  return ctx.db.journal.findMany({
    where: liveJournalWhere(ctx.userId),
    select: journalSelect,
    orderBy: { updatedAt: "desc" },
  });
}

/** The caller's trashed journals, each with the titles of the notes it holds. */
export async function listTrashedJournals(ctx: JournalAccessContext) {
  return ctx.db.journal.findMany({
    where: trashedJournalWhere(ctx.userId),
    select: {
      ...journalSelect,
      notes: {
        select: { id: true, updatedAt: true, title: true },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Reads one owned live journal, or NOT_FOUND — like a missing note. A trashed
 * journal is hidden everywhere but the trash, so it is not found here either.
 */
export async function findJournal(
  ctx: JournalAccessContext,
  journalId: string,
) {
  const journal = await ctx.db.journal.findFirst({
    where: { id: journalId, ...liveJournalWhere(ctx.userId) },
    select: journalSelect,
  });

  if (!journal) throw new ORPCError("NOT_FOUND");

  return journal;
}

/** Live → trashed, or NOT_FOUND. */
export async function trashJournal(
  ctx: JournalAccessContext,
  journalId: string,
) {
  const { count } = await ctx.db.journal.updateMany({
    where: { id: journalId, ...liveJournalWhere(ctx.userId) },
    data: { trash: true },
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}

/** Trashed → live, or NOT_FOUND. */
export async function restoreJournal(
  ctx: JournalAccessContext,
  journalId: string,
) {
  const { count } = await ctx.db.journal.updateMany({
    where: { id: journalId, ...trashedJournalWhere(ctx.userId) },
    data: { trash: false },
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}

/**
 * Trashed → gone, with all its notes (the relation cascades), or NOT_FOUND.
 * Only a trashed journal can be purged: a live one has to pass through the
 * trash first.
 */
export async function purgeJournal(
  ctx: JournalAccessContext,
  journalId: string,
) {
  const { count } = await ctx.db.journal.deleteMany({
    where: { id: journalId, ...trashedJournalWhere(ctx.userId) },
  });

  if (count === 0) throw new ORPCError("NOT_FOUND");
}
