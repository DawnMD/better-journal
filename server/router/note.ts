import { ORPCError } from "@orpc/client";
import { format } from "date-fns";
import z from "zod";
import { resolveTimeZone, zonedDayAndMinutes } from "@/lib/timezone";
import { emptyDoc, toPlainText } from "@/lib/plate";
import { assertJournalOwned, assertNoteOwned } from "../lib/authorize";
import { rangeWindow } from "../lib/day-window";
import { protectedProcedure } from "../orpc";

/** Plate block node — `children` is recursive, so it is validated loosely below the top level. */
const plateValue = z.array(
  z.object({
    type: z.string().optional(),
    children: z.array(z.any()),
  }),
);

/**
 * The reader's IANA timezone, e.g. `Asia/Kolkata`. Supplied by the client from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`; validated server-side in
 * `resolveTimeZone`, which falls back to UTC rather than throwing.
 */
const timeZoneInput = z.string().optional();

export const notesRouter = {
  createNote: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      const defaultTitle = format(new Date(), "MMMM do, yyyy 'at' h:mm a");

      return context.db.note.create({
        data: {
          journalId: input.journalId,
          // A real empty Plate document, not "". The editor reads this straight
          // into `usePlateEditor({ value })`, which needs a block to exist.
          content: emptyDoc(),
          plainText: "",
          title: defaultTitle,
        },
      });
    }),
  /**
   * Every note the calendar's visible grid covers, in one round trip.
   *
   * The single read behind all three views — a month grid is a 42-day range, a
   * week is 7, a day is 1 — so switching view or paging a month is one query,
   * not a list query plus a counts query that could disagree with it. Per-day
   * counts are no longer a separate aggregate at all: the grid has the notes, so
   * it can count them, and a badge that contradicts the cell under it stops
   * being expressible.
   *
   * Still bounded. `rangeWindow` caps the span at six weeks, which is what keeps
   * this from degenerating into "load the whole journal" the way the original
   * client-side counting did.
   *
   * `day` and `minutes` are computed here, in the same zone the window was cut
   * in, rather than left for the browser to read off `createdAt`. The client
   * renders whichever zone it *asked* for; deriving the position from a local
   * `Date` getter would answer for the browser's instead, and the two are only
   * usually the same.
   */
  getNotesInRange: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        /** `yyyy-MM-dd`, inclusive. */
        start: z.string(),
        /** `yyyy-MM-dd`, inclusive. */
        end: z.string(),
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      // The day boundaries are computed in the reader's zone, not the server's.
      // On Vercel the server is UTC, which would file a note written at 02:00
      // IST under the previous day.
      const zone = resolveTimeZone(input.timeZone);
      const { start, end } = rangeWindow(input.start, input.end, zone);

      const notes = await context.db.note.findMany({
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
          // Ridden along rather than fetched separately, and not an N+1: Prisma
          // resolves an implicit m2m as one extra round trip for the whole page
          // (`WHERE "A" IN (...)`, served by _NoteToTag_AB_pkey), so a 42-day
          // grid goes from one query to two no matter how many notes it holds.
          // Fetching them here is also what lets the calendar filter run over
          // this one array, so the cells, the counts and the "+N more" cannot
          // disagree about which notes are on screen.
          tags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
        // Ascending, unlike the old day list: the time grid reads top-down, and
        // `packEvents` needs chronological order anyway.
        orderBy: {
          createdAt: "asc",
        },
      });

      return notes.map((note) => ({
        ...note,
        ...zonedDayAndMinutes(note.createdAt, zone),
      }));
    }),
  getNoteById: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      // Ownership is part of the query rather than a check on the result: a note
      // in someone else's journal is simply not found. See assertJournalOwned
      // for why NOT_FOUND and not FORBIDDEN.
      const note = await context.db.note.findFirst({
        where: {
          id: input.noteId,
          journal: {
            userId: context.userId,
            trash: false,
          },
        },
        // An explicit select rather than `include`, so adding a column to Note
        // does not silently start shipping it to the browser.
        select: {
          id: true,
          journalId: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!note) throw new ORPCError("NOT_FOUND");

      return note;
    }),
  saveNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        content: plateValue,
      }),
    )
    .handler(async ({ context, input }) => {
      // Confirms the journal is not locked. A blind scoped write would let a
      // caller edit a protected journal's notes straight past the password, since
      // this endpoint never mentions the journal.
      await assertNoteOwned(context, input.noteId);

      // The ownership predicate still rides on the write itself, so there is no
      // window in which the journal could change hands between check and update.
      const { count } = await context.db.note.updateMany({
        where: {
          id: input.noteId,
          journal: {
            userId: context.userId,
            trash: false,
          },
        },
        data: {
          content: input.content,
          // Kept in step with content on every save. Postgres regenerates
          // searchVector from this automatically, so the index cannot fall behind.
          plainText: toPlainText(input.content),
        },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      // Only the note, and only what changed. Returning the joined journal row
      // here previously let the caller write a mismatched shape into the
      // getNoteById cache.
      return {
        id: input.noteId,
        content: input.content,
      };
    }),
  renameNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      const { count } = await context.db.note.updateMany({
        where: {
          id: input.noteId,
          journal: {
            userId: context.userId,
            trash: false,
          },
        },
        data: {
          title: input.title,
        },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.noteId, title: input.title };
    }),
  deleteNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      const { count } = await context.db.note.deleteMany({
        where: {
          id: input.noteId,
          journal: {
            userId: context.userId,
            trash: false,
          },
        },
      });

      if (count === 0) throw new ORPCError("NOT_FOUND");

      return { id: input.noteId };
    }),
};
