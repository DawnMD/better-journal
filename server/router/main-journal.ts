import { ORPCError } from "@orpc/client";
import { hash, verify } from "@node-rs/argon2";
import { cookies } from "next/headers";
import z from "zod";
import {
  issueUnlockToken,
  unlockCookieName,
  UNLOCK_TTL_SECONDS,
} from "../lib/unlock";
import { protectedProcedure } from "../orpc";

/**
 * Writes a journal's unlock token as an HttpOnly cookie.
 *
 * HttpOnly so client script cannot read or forge it; `sameSite: lax` so it is not
 * sent on cross-site requests; `secure` outside development. Scoped per journal,
 * so unlocking one does not unlock the rest.
 */
async function writeUnlockCookie(journalId: string, userId: string) {
  const store = await cookies();

  store.set(unlockCookieName(journalId), issueUnlockToken(journalId, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });
}

export const journalRouter = {
  getAllJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return await context.db.journal.findMany({
        where: {
          userId: context.userId,
          trash: false,
        },
        // Without an explicit order Postgres is free to return rows in any
        // order, which made the sidebar reshuffle between renders. This ordering
        // is what @@index([userId, trash, updatedAt]) exists to serve.
        orderBy: { updatedAt: "desc" },
      });
    }),
  createJournal: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional(),
      }),
    )
    .output(z.string())
    .handler(async ({ context, input }) => {
      const data = await context.db.journal.create({
        data: {
          title: input.title,
          userId: context.userId,
          description: input.description,
        },
      });

      return data.id;
    }),
  /**
   * The journal itself. Notes are deliberately *not* included: the calendar
   * that used to need them is served by `notesRouter.getNotesInRange`, which is
   * bounded to the days actually on screen instead of loading every note the
   * journal has ever held.
   */
  getJournalById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: {
          id: input.id,
          userId: context.userId,
          trash: false,
        },
      });

      // Null rather than a throw: the caller renders notFound() for this, and a
      // missing journal is an expected navigation outcome, not an error.
      return journal ?? null;
    }),
  moveToTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      // Scoped write: ownership is a predicate on the update, so a journal the
      // caller does not own is indistinguishable from one that does not exist.
      // NOT_FOUND (not UNAUTHORIZED) — the caller *is* authenticated, and 401
      // would bounce a legitimately signed-in user out of the app.
      const { count } = await context.db.journal.updateMany({
        where: { id: input.id, userId: context.userId },
        data: { trash: true },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.id };
    }),
  removeFromTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { count } = await context.db.journal.updateMany({
        where: { id: input.id, userId: context.userId },
        data: { trash: false },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.id };
    }),
  deletePermanently: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { count } = await context.db.journal.deleteMany({
        where: { id: input.id, userId: context.userId },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.id };
    }),
  /**
   * Sets or changes a journal's password.
   *
   * Requires the current password when one is already set, so someone who walks
   * up to an unlocked session cannot silently re-key a protected journal.
   * Succeeding also issues an unlock token — otherwise you would lock yourself
   * out of the journal you just protected.
   */
  setJournalPassword: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        password: z.string().min(8).max(128),
        currentPassword: z.string().max(128).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id, userId: context.userId, trash: false },
        select: { id: true, hashedPassword: true },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (journal.hashedPassword) {
        const ok =
          !!input.currentPassword &&
          (await verify(journal.hashedPassword, input.currentPassword));

        if (!ok) {
          throw new ORPCError("FORBIDDEN", {
            message: "Current password is incorrect.",
          });
        }
      }

      await context.db.journal.update({
        where: { id: input.id },
        data: { hashedPassword: await hash(input.password) },
      });

      await writeUnlockCookie(input.id, context.userId);

      return { id: input.id, protected: true };
    }),
  /**
   * Verifies a password and, on success, sets the journal's unlock cookie.
   *
   * The cookie is the actual access grant — see server/lib/unlock.ts. Returning a
   * boolean to the client would be advisory only; the server has to be able to
   * re-check on every later request without asking again.
   */
  unlockJournal: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        password: z.string().max(128),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id, userId: context.userId, trash: false },
        select: { id: true, hashedPassword: true },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (!journal.hashedPassword) {
        // Nothing to unlock. Not an error — the client can just proceed.
        return { id: input.id, unlocked: true };
      }

      const ok = await verify(journal.hashedPassword, input.password);

      if (!ok) {
        throw new ORPCError("FORBIDDEN", {
          message: "Incorrect password.",
          data: { reason: "bad_password" as const },
        });
      }

      await writeUnlockCookie(input.id, context.userId);

      return { id: input.id, unlocked: true };
    }),
  removeJournalPassword: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        currentPassword: z.string().max(128),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id, userId: context.userId, trash: false },
        select: { id: true, hashedPassword: true },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (
        journal.hashedPassword &&
        !(await verify(journal.hashedPassword, input.currentPassword))
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "Current password is incorrect.",
        });
      }

      await context.db.journal.update({
        where: { id: input.id },
        data: { hashedPassword: null },
      });

      // Drop the now-pointless cookie rather than leaving it to expire.
      const store = await cookies();
      store.delete(unlockCookieName(input.id));

      return { id: input.id, protected: false };
    }),
  /** Which of the user's journals are protected, for rendering lock badges. */
  getProtectedJournalIds: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const rows = await context.db.journal.findMany({
        where: {
          userId: context.userId,
          trash: false,
          hashedPassword: { not: null },
        },
        select: { id: true },
      });

      return rows.map((row) => row.id);
    }),
  getTrashedJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return await context.db.journal.findMany({
        where: {
          userId: context.userId,
          trash: true,
        },
        include: {
          notes: {
            select: {
              id: true,
              updatedAt: true,
              title: true,
            },
            orderBy: { updatedAt: "desc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    }),
};
