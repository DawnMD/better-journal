import z from "zod";
import {
  findJournal,
  listLiveJournals,
  listTrashedJournals,
  purgeJournal,
  restoreJournal,
  trashJournal,
} from "../lib/journal-access";
import { protectedProcedure } from "../orpc";

/**
 * Journal procedures. Each one only wires its input to journal access, which
 * owns which journals a caller may reach and the trash lifecycle: a live
 * journal can be trashed, a trashed journal can be restored or purged, and
 * everything else is NOT_FOUND.
 */
export const journalRouter = {
  /** The sidebar's journal list. */
  getAllJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => listLiveJournals(context)),
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
   * The journal itself, or NOT_FOUND for one that is missing, someone else's or
   * in the trash — the page turns that into a 404, as it does for a note.
   *
   * Notes are deliberately *not* included: the calendar is served by
   * `notesRouter.getNotesInRange`, which is bounded to the days actually on
   * screen instead of loading every note the journal has ever held.
   */
  getJournalById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => findJournal(context, input.id)),
  /** Live → trashed. */
  moveToTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await trashJournal(context, input.id);

      return { id: input.id };
    }),
  /** Trashed → live. */
  removeFromTrash: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await restoreJournal(context, input.id);

      return { id: input.id };
    }),
  /** Purges a trashed journal and all its notes. */
  deletePermanently: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await purgeJournal(context, input.id);

      return { id: input.id };
    }),
  getTrashedJournal: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => listTrashedJournals(context)),
};
