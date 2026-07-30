import { ORPCError } from "@orpc/client";
import { format } from "date-fns";
import z from "zod";
import { resolveTimeZone } from "@/lib/timezone";
import { emptyDoc } from "@/lib/plate";
import {
  assertJournalOwned,
  assertNoteOwned,
  assertUnlocked,
} from "../lib/authorize";
import { dayWindow, monthWindow } from "../lib/day-window";
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
          title: defaultTitle,
        },
      });
    }),
  getAllNotesByIdAndDate: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        date: z.string(),
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      // The day boundary is computed in the reader's zone, not the server's.
      // On Vercel the server is UTC, which would file a note written at 02:00
      // IST under the previous day.
      const { start, end } = dayWindow(
        input.date,
        resolveTimeZone(input.timeZone),
      );

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
  /**
   * Per-day note counts for the calendar badges, for one month only.
   *
   * Replaces loading every note the journal has ever held into memory just to
   * count them. Aggregation happens in Postgres and is bounded by the visible
   * month, so the cost stops growing with journal size.
   *
   * Raw SQL because the bucketing has to happen in the reader's timezone, and
   * Prisma's `groupBy` cannot express a timezone-shifted date truncation.
   * `createdAt` is `TIMESTAMP(3)` (naive, holding UTC), so it is first labelled
   * UTC and then converted — a single `AT TIME ZONE` would read the stored value
   * as though it were already local and shift it the wrong way.
   */
  getNoteCountsByMonth: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        /** `yyyy-MM` */
        month: z.string(),
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      // Raw SQL bypasses Prisma's relation filters, so ownership is asserted
      // separately here rather than being a predicate on the query.
      await assertJournalOwned(context, input.journalId);

      const zone = resolveTimeZone(input.timeZone);
      const { start, end } = monthWindow(input.month, zone);

      const rows = await context.db.$queryRaw<
        { day: string; count: number }[]
      >`
        SELECT
          to_char(
            ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date,
            'YYYY-MM-DD'
          ) AS day,
          COUNT(*)::int AS count
        FROM "Note"
        WHERE "journalId" = ${input.journalId}
          AND "createdAt" >= ${start}
          AND "createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1
      `;

      // Shaped as a lookup so the calendar can index by day key directly.
      return rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.day] = row.count;
        return acc;
      }, {});
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
        // Pulling the lock state into this same query means the unlock check
        // below costs no extra round trip.
        include: { journal: { select: { hashedPassword: true } } },
      });

      if (!note) throw new ORPCError("NOT_FOUND");

      assertUnlocked(context, note.journalId, note.journal.hashedPassword);

      // The joined journal is an implementation detail of the lock check and
      // must not leak into the response shape the client caches.
      const { journal: _journal, ...rest } = note;

      return rest;
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
