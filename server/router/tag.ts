import { ORPCError } from "@orpc/client";
import z from "zod";
import { MAX_TAG_NAME, normalizeTagName } from "@/lib/tags";
import { assertJournalOwned, assertNoteOwned } from "../lib/authorize";
import { protectedProcedure } from "../orpc";

/**
 * Tag names are normalised on the way in — see `normalizeTagName` for why.
 *
 * The rule lives in lib/tags.ts rather than here because the rename dialog has
 * to apply the identical transform client-side to know whether a draft collides
 * with a name the user already owns.
 *
 * Length is checked *after* normalising, so trailing whitespace cannot push an
 * otherwise-fine name over the limit.
 */
const tagName = z
  .string()
  .transform(normalizeTagName)
  .pipe(z.string().min(1).max(MAX_TAG_NAME));

/**
 * Postgres' unique-constraint violation, as Prisma reports it.
 *
 * Matched on the code rather than by `instanceof`: the generated client's error
 * classes are not worth importing for one branch, and `P2002` is stable API.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

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
  /**
   * Renames a tag, or merges it into an existing one when asked.
   *
   * The awkward case is a rename onto a name the user already owns. Rejecting it
   * outright reads as a bug — names are normalised, so "Office" and "office" are
   * indistinguishable on screen and the refusal would look arbitrary. Merging
   * silently is worse: it destroys a tag, and everything it was attached to, on
   * a keystroke. So the conflict comes back as a `CONFLICT` carrying the
   * survivor's id and how many notes it holds, which is enough for the client to
   * ask "merge 12 notes into 'office'?" and call again with `merge: true`.
   */
  renameTag: protectedProcedure
    .input(
      z.object({
        tagId: z.string(),
        name: tagName,
        merge: z.boolean().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const tag = await context.db.tag.findFirst({
        where: { id: input.tagId, userId: context.userId },
        select: { id: true, name: true },
      });

      // NOT_FOUND rather than FORBIDDEN for a tag that is simply not theirs —
      // see server/lib/authorize.ts on why the two are the same answer here.
      if (!tag) throw new ORPCError("NOT_FOUND");

      // Renaming to the name it already has. Not a conflict with itself, and not
      // worth a write; the client's dialog can't always tell, since it compares
      // a raw draft against a normalised name.
      if (tag.name === input.name) {
        return { id: tag.id, name: tag.name, mergedFrom: null };
      }

      const existing = await context.db.tag.findFirst({
        where: { userId: context.userId, name: input.name },
        select: { id: true, _count: { select: { notes: true } } },
      });

      if (!existing) {
        try {
          const renamed = await context.db.tag.update({
            where: { id: tag.id },
            data: { name: input.name },
            select: { id: true, name: true },
          });

          return { ...renamed, mergedFrom: null };
        } catch (error) {
          // A concurrent request can create that name between the check above
          // and this write. Postgres arbitrates via the ([userId, name]) unique
          // constraint — the same stance as the `connectOrCreate` above — and we
          // fall through to the conflict path rather than reporting a 500.
          if (!isUniqueViolation(error)) throw error;
        }
      }

      const survivor =
        existing ??
        (await context.db.tag.findFirst({
          where: { userId: context.userId, name: input.name },
          select: { id: true, _count: { select: { notes: true } } },
        }));

      // Only reachable if the racing creator also deleted it again; treat the
      // name as free and retry the plain rename.
      if (!survivor) {
        const renamed = await context.db.tag.update({
          where: { id: tag.id },
          data: { name: input.name },
          select: { id: true, name: true },
        });

        return { ...renamed, mergedFrom: null };
      }

      if (input.merge !== true) {
        throw new ORPCError("CONFLICT", {
          data: {
            reason: "tag-exists" as const,
            existingTagId: survivor.id,
            noteCount: survivor._count.notes,
          },
        });
      }

      await context.db.$transaction(async (tx) => {
        const notes = await tx.note.findMany({
          where: { tags: { some: { id: tag.id } } },
          select: { id: true },
        });

        // Connect *before* the delete: the delete cascades the old tag's join
        // rows away, so doing it first would lose the list of notes to move.
        // `connect` on a pair that already exists is a no-op, so a note carrying
        // both tags ends up with exactly one join row, not a duplicate-key error.
        if (notes.length > 0) {
          await tx.tag.update({
            where: { id: survivor.id },
            data: { notes: { connect: notes.map(({ id }) => ({ id })) } },
          });
        }

        await tx.tag.delete({ where: { id: tag.id } });
      });

      return { id: survivor.id, name: input.name, mergedFrom: tag.id };
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
