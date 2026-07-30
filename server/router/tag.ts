import { ORPCError } from "@orpc/client";
import z from "zod";
import { assertJournalOwned, assertNoteOwned } from "../lib/authorize";
import { protectedProcedure } from "../orpc";

/**
 * Tag names are normalised on the way in: trimmed, collapsed whitespace,
 * lowercased. Without this "Work", "work " and "work" become three tags that
 * look identical in the UI, and the ([userId, name]) unique constraint would not
 * catch it.
 */
const tagName = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((value) => value.replace(/\s+/g, " ").toLowerCase());

export const tagRouter = {
  /** Every tag the user owns, with how many notes carry it. */
  getAllTags: protectedProcedure.input(z.void()).handler(async ({ context }) => {
    const tags = await context.db.tag.findMany({
      where: { userId: context.userId },
      select: {
        id: true,
        name: true,
        _count: { select: { notes: true } },
      },
      orderBy: { name: "asc" },
    });

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      noteCount: tag._count.notes,
    }));
  }),
  /**
   * Attaches a tag to a note, creating the tag if the user does not have it yet.
   *
   * `connectOrCreate` on the ([userId, name]) unique constraint, so two rapid
   * requests for the same new tag cannot produce a duplicate — Postgres arbitrates
   * rather than a read-then-write in application code.
   */
  addTagToNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        name: tagName,
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      const note = await context.db.note.update({
        where: { id: input.noteId },
        data: {
          tags: {
            connectOrCreate: {
              where: {
                userId_name: { userId: context.userId, name: input.name },
              },
              create: { name: input.name, userId: context.userId },
            },
          },
        },
        select: {
          tags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
      });

      return note.tags;
    }),
  removeTagFromNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        tagId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      // The tag must also be ours. Without this check a caller could detach
      // another user's tag row from their own note, which is harmless in effect
      // but still an operation on someone else's data.
      const tag = await context.db.tag.findFirst({
        where: { id: input.tagId, userId: context.userId },
        select: { id: true },
      });

      if (!tag) throw new ORPCError("NOT_FOUND");

      const note = await context.db.note.update({
        where: { id: input.noteId },
        data: { tags: { disconnect: { id: input.tagId } } },
        select: {
          tags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
      });

      return note.tags;
    }),
  getTagsForNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      return context.db.tag.findMany({
        where: {
          userId: context.userId,
          notes: { some: { id: input.noteId } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }),
  /** Notes in a journal carrying *all* of the given tags. */
  getNotesByTags: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        tagIds: z.array(z.string()).min(1).max(10),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      // AND semantics: every tag must be present. Expressed as one `every`-style
      // clause per tag because Prisma has no direct "has all of" operator on an
      // implicit m2m.
      return context.db.note.findMany({
        where: {
          journalId: input.journalId,
          AND: input.tagIds.map((tagId) => ({
            tags: { some: { id: tagId, userId: context.userId } },
          })),
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          tags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    }),
  deleteTag: protectedProcedure
    .input(z.object({ tagId: z.string() }))
    .handler(async ({ context, input }) => {
      // Scoped delete; the join rows go with it via ON DELETE CASCADE.
      const { count } = await context.db.tag.deleteMany({
        where: { id: input.tagId, userId: context.userId },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.tagId };
    }),
};
