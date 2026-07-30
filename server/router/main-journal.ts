import { ORPCError } from "@orpc/client";
import z from "zod";
import { protectedProcedure } from "../orpc";

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
   * badges that used to need them are served by
   * `notesRouter.getNoteCountsByMonth`, which aggregates in Postgres for one
   * month instead of loading every note the journal has ever held.
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
