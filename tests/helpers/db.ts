import { PrismaPg } from "@prisma/adapter-pg";
import { createRouterClient } from "@orpc/server";
import { PrismaClient } from "@/prisma/generated/prisma/client";
import { router } from "@/server/router";

/**
 * A Prisma client bound to the *test* database.
 *
 * Deliberately not `lib/prisma.ts`: that reads the validated `env`, which points
 * at the development database. Importing it here would let a `TRUNCATE` land on
 * real data.
 */
export const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.TEST_DATABASE_URL,
  }),
});

/**
 * Calls procedures the way the app does, minus HTTP.
 *
 * `createRouterClient` runs the real middleware chain — including the
 * `protectedProcedure` auth guard — so a test that passes a `userId` is
 * exercising the same code path a signed-in request takes. There is no server to
 * boot and no fetch to mock.
 */
export function callerFor(
  userId: string | null,
  /**
   * Unlock tokens this "request" carries, keyed by journal id — the test-suite
   * stand-in for the HttpOnly cookies the browser would send. Omit it to
   * simulate a caller who has not unlocked anything.
   */
  unlockTokens: Record<string, string> = {},
) {
  return createRouterClient(router, {
    context: {
      db: testDb,
      userId,
      unlockToken: (journalId: string) => unlockTokens[journalId],
    },
  });
}

/**
 * Every table. CASCADE also clears the implicit `_NoteToTag` join table, which has
 * no Prisma model of its own.
 */
export async function resetDb() {
  await testDb.$executeRawUnsafe(
    `TRUNCATE TABLE "Note", "Journal", "Tag" RESTART IDENTITY CASCADE`,
  );
}

/** A journal owned by `userId`, with sensible defaults. */
export async function makeJournal(
  userId: string,
  overrides: Partial<{ title: string; description: string; trash: boolean }> = {},
) {
  return testDb.journal.create({
    data: {
      title: overrides.title ?? "Test journal",
      description: overrides.description,
      trash: overrides.trash ?? false,
      userId,
    },
  });
}

/**
 * A note in `journalId`. `createdAt` is settable so timezone tests can place a
 * note at a specific UTC instant rather than "now".
 */
export async function makeNote(
  journalId: string,
  overrides: Partial<{
    title: string;
    content: unknown;
    plainText: string;
    createdAt: Date;
  }> = {},
) {
  return testDb.note.create({
    data: {
      journalId,
      title: overrides.title ?? "Test note",
      content: (overrides.content ?? [
        { type: "p", children: [{ text: "" }] },
      ]) as never,
      // Set explicitly rather than derived, so a test can deliberately create the
      // stale-plainText state that the backfill script exists to repair.
      plainText: overrides.plainText ?? "",
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}

export const USER_A = "user_aaaaaaaaaaaaaaaaaaaaaa";
export const USER_B = "user_bbbbbbbbbbbbbbbbbbbbbb";
