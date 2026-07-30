import { ORPCError } from "@orpc/server";
import type { PrismaClient } from "@/prisma/generated/prisma/client";

/**
 * Per-user daily cap on AI requests.
 *
 * A Postgres counter, not Redis. The limit only needs to be roughly right, the
 * app already has a database, and a second datastore for one integer is not a
 * trade worth making.
 *
 * The upsert is the whole mechanism: `([userId, day])` is unique, so two
 * concurrent requests cannot both read the same count and both write count+1 —
 * Postgres serialises them and `increment` is applied server-side.
 */

export const DAILY_AI_LIMIT = 50;

/** Calendar day in UTC. Deliberately not the user's zone: this is a billing control, not a calendar. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function consumeAiQuota(
  db: PrismaClient,
  userId: string,
  limit = DAILY_AI_LIMIT,
): Promise<{ used: number; limit: number }> {
  const day = today();

  const row = await db.aiUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > limit) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: `Daily AI limit of ${limit} requests reached. Resets at midnight UTC.`,
      data: { used: row.count, limit },
    });
  }

  return { used: row.count, limit };
}

/** Current usage without consuming any. For showing remaining quota in the UI. */
export async function readAiQuota(
  db: PrismaClient,
  userId: string,
  limit = DAILY_AI_LIMIT,
): Promise<{ used: number; limit: number }> {
  const row = await db.aiUsage.findUnique({
    where: { userId_day: { userId, day: today() } },
    select: { count: true },
  });

  return { used: row?.count ?? 0, limit };
}
