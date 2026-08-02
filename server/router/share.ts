import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import z from "zod";
import { assertNoteOwned } from "../lib/authorize";
import { protectedProcedure, publicProcedure } from "../orpc";

/**
 * Read-only links to a single note, for someone with no account.
 *
 * The only part of the app that answers without a session, so the rules are
 * narrower than everywhere else:
 *
 * - The token is the credential. Nothing else identifies the reader, so it has
 *   to be unguessable on its own — see `mintToken`.
 * - `getSharedNote` returns three fields, listed explicitly. Not the note id, not
 *   the journal id, not the tags, and above all not the `userId`: a link should
 *   say what was shared and nothing about who shared it or what else they have
 *   written. An `include` here would leak the next column somebody adds to Note.
 * - The note is read *through* the share row on every request rather than copied
 *   into it, so edits reach the recipient and a revoke lands immediately.
 */

/**
 * 32 bytes from the CSPRNG, base64url so it survives a URL untouched.
 *
 * Not a cuid, which is what every other id in this schema is: cuids embed a
 * timestamp and a counter and are only ever meant to be unique, not secret. This
 * value is the entire access check, so it needs 256 bits of real entropy —
 * guessing one is not a thing an attacker can do, which is why the endpoint
 * needs no rate limit to be safe against enumeration.
 */
function mintToken() {
  return randomBytes(32).toString("base64url");
}

export const shareRouter = {
  /**
   * Publishes `noteId` and returns its token, or returns the existing one.
   *
   * Idempotent by way of the unique `noteId`: pressing Share twice hands back the
   * same URL instead of minting a second live token that revoking the first would
   * not close. The upsert's `update` is deliberately empty — an existing link is
   * left exactly as it is, including its `createdAt`.
   */
  createShareLink: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      const share = await context.db.noteShare.upsert({
        where: { noteId: input.noteId },
        create: { noteId: input.noteId, token: mintToken() },
        update: {},
        select: { token: true, createdAt: true },
      });

      return share;
    }),
  /** The note's live token, or null. Ownership first, so this cannot report on someone else's note. */
  getShareLink: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      return context.db.noteShare.findUnique({
        where: { noteId: input.noteId },
        select: { token: true, createdAt: true },
      });
    }),
  /**
   * Takes the link out of circulation. The old token is gone, not disabled, so
   * sharing again produces a genuinely new URL rather than reviving the one that
   * was already pasted somewhere.
   *
   * Deleting a link that is not there is a success: the caller wanted this note
   * unshared, and it is. Two clicks on Revoke should not produce an error.
   */
  revokeShareLink: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      await context.db.noteShare.deleteMany({
        where: { noteId: input.noteId },
      });

      return { noteId: input.noteId };
    }),
  /**
   * The public read. No session, no `userId` — the token is the whole claim.
   *
   * `journal.trash` is re-checked here rather than trusted from share time, so
   * trashing a journal darkens its links without a sweep over NoteShare, and
   * restoring it brings them back. Revoked, deleted and never-shared all come
   * back NOT_FOUND, which is the same answer a wrong token gets: there is nothing
   * to tell apart, since the reader was never anybody in the first place.
   */
  getSharedNote: publicProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ context, input }) => {
      const share = await context.db.noteShare.findFirst({
        where: {
          token: input.token,
          note: { journal: { trash: false } },
        },
        select: {
          note: {
            select: {
              title: true,
              content: true,
              createdAt: true,
            },
          },
        },
      });

      if (!share) throw new ORPCError("NOT_FOUND");

      return share.note;
    }),
};
