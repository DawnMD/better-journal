import z from "zod";
import { protectedProcedure } from "../orpc";
import { addDays, format, startOfDay, parseISO } from "date-fns";
import { ORPCError } from "@orpc/client";

export const notesRouter = {
  createNote: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const defaultTitle = format(new Date(), "MMMM do, yyyy 'at' h:mm a");
      return context.db.note.create({
        data: {
          journalId: input.journalId,
          content: "",
          title: defaultTitle,
        },
      });
    }),
  getAllNotesByIdAndDate: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        date: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const date = parseISO(input.date);
      const start = startOfDay(date);
      const end = addDays(start, 1);

      return await context.db.note.findMany({
        where: {
          journalId: input.journalId,
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
          createdAt: "desc",
        },
      });
    }),
  getNoteById: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const note = await context.db.note.findUnique({
        where: {
          id: input.noteId,
        },
        include: {
          journal: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (note?.journal.userId !== context.userId)
        throw new ORPCError("UNAUTHORIZED");

      return note;
    }),
};
