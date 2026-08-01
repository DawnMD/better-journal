import { ORPCError } from "@orpc/client";
import z from "zod";
import { protectedProcedure } from "../orpc";

/**
 * The journal columns that are safe to send to a browser.
 *
 * Spelled out rather than left to Prisma's default "every scalar", so adding a
 * column to the model does not silently start shipping it to the client.
 */
const journalPublicFields = {
  id: true,
  title: true,
  description: true,
  userId: true,
  trash: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const journalRouter = {
  /** The sidebar's journal list. */
  getAllJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return context.db.journal.findMany({
        where: {
          userId: context.userId,
          trash: false,
        },
        select: journalPublicFields,
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
      // Null rather than a throw: the caller renders notFound() for this, and a
      // missing journal is an expected navigation outcome, not an error.
      return context.db.journal.findFirst({
        where: {
          id: input.id,
          userId: context.userId,
          trash: false,
        },
        select: journalPublicFields,
      });
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
  getTrashedJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return context.db.journal.findMany({
        where: {
          userId: context.userId,
          trash: true,
        },
        select: {
          ...journalPublicFields,
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
