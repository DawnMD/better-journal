import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { unlockCookieName } from "./lib/unlock";

export async function createContext() {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  return {
    db: prisma,
    userId,
    /**
     * Reads a journal's unlock token from its HttpOnly cookie.
     *
     * Injected as a function rather than having `assertJournalOwned` call
     * `cookies()` itself: that would bind the authorization helper to Next's
     * request scope and make it unusable from the Vitest suite, which builds a
     * context by hand.
     */
    unlockToken: (journalId: string) =>
      cookieStore.get(unlockCookieName(journalId))?.value,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
