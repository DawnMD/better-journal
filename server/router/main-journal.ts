import z from "zod";
// import argon2 from "argon2";
import { protectedProcedure } from "../orpc";
import { ORPCError } from "@orpc/client";
import { startOfDay, addDays, parseISO } from "date-fns";

export const journalRouter = {
  getAllJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return await context.db.journal.findMany({
        where: {
          userId: context.userId,
          AND: {
            trash: false,
          },
        },
      });
    }),
  createJournal: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        // hidden: z.boolean(),
        // password: z.string().optional(),
      }),
    )
    .output(z.string())
    .handler(async ({ context, input }) => {
      // let hashedPassword: string | undefined;
      // if (input.password) hashedPassword = await argon2.hash(input.password);

      const data = await context.db.journal.create({
        data: {
          title: input.title,
          userId: context.userId,
          // hidden: input.hidden,
          description: input.description,
          // hashedPassword,
        },
      });

      return data.id;
    }),
  getJournalById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        date: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const date = parseISO(input.date);
      const start = startOfDay(date);
      const end = addDays(start, 1);

      const journal = await context.db.journal.findUnique({
        where: {
          id: input.id,
        },

        include: {
          notes: {
            where: {
              createdAt: {
                gte: start,
                lt: end,
              },
            },
            select: {
              title: true,
              createdAt: true,
              id: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      if (!journal || journal.userId !== context.userId || journal.trash) {
        return null;
      }

      return journal;
    }),
  moveToTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (journal.userId !== context.userId)
        throw new ORPCError("UNAUTHORIZED");

      return await context.db.journal.update({
        where: {
          id: input.id,
        },
        data: {
          trash: true,
        },
      });
    }),
  removeFromTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (journal.userId !== context.userId)
        throw new ORPCError("UNAUTHORIZED");

      return await context.db.journal.update({
        where: {
          id: input.id,
        },
        data: {
          trash: false,
        },
      });
    }),
  deletePermanently: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const journal = await context.db.journal.findFirst({
        where: { id: input.id },
      });

      if (!journal) throw new ORPCError("NOT_FOUND");

      if (journal.userId !== context.userId)
        throw new ORPCError("UNAUTHORIZED");

      return await context.db.journal.delete({
        where: {
          id: input.id,
        },
      });
    }),
  getTrashedJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      return await context.db.journal.findMany({
        where: {
          userId: context.userId,
          AND: {
            trash: true,
          },
        },
        include: {
          notes: {
            select: {
              id: true,
              updatedAt: true,
              title: true,
            },
          },
        },
      });
    }),
};
