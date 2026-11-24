import z from "zod";
import { MAX_TAG_NAME, normalizeTagName } from "@/lib/tags";
import { assertNoteOwned } from "../lib/note-access";
import {
  addTagToNote,
  deleteTag,
  listTags,
  removeTagFromNote,
  renameTag,
  tagsOfNote,
} from "../lib/tags";
import { protectedProcedure } from "../orpc";

/**
 * Tag procedures. The rules — which tags a caller may name, how a rename
 * resolves a clash — live in server/lib/tags.ts; this file only wires them.
 */

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

export const tagRouter = {
  /** Every tag the user owns, with how many notes carry it. */
  getAllTags: protectedProcedure
    .input(z.void())
    .handler(({ context }) => listTags(context)),
  /** Attaches a tag to a note, creating the tag if the user does not have it yet. */
  addTagToNote: protectedProcedure
    .input(z.object({ noteId: z.string(), name: tagName }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      return addTagToNote(context, input.noteId, input.name);
    }),
  removeTagFromNote: protectedProcedure
    .input(z.object({ noteId: z.string(), tagId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      return removeTagFromNote(context, input.noteId, input.tagId);
    }),
  getTagsForNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      return tagsOfNote(context, input.noteId);
    }),
  /**
   * Renames a tag, or merges it into an existing one when asked. A clash with
   * an existing name is a CONFLICT unless `merge` is true — see `renameTag`.
   */
  renameTag: protectedProcedure
    .input(
      z.object({
        tagId: z.string(),
        name: tagName,
        merge: z.boolean().optional(),
      }),
    )
    .handler(({ context, input }) =>
      renameTag(context, input.tagId, input.name, input.merge === true),
    ),
  deleteTag: protectedProcedure
    .input(z.object({ tagId: z.string() }))
    .handler(async ({ context, input }) => {
      await deleteTag(context, input.tagId);

      return { id: input.tagId };
    }),
};
