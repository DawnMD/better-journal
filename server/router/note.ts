import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import z from "zod";
import { resolveTimeZone } from "@/lib/reader-calendar-core";
import { emptyDoc, toPlainText } from "@/lib/plate";
import {
  assertJournalOwned,
  deleteNote,
  findNote,
  ownedNoteWhere,
  updateNote,
} from "../lib/note-access";
import { readerZoneInput } from "../lib/reader-calendar";
import { assertTagsOwned, tagSummary } from "../lib/tags";
import { MAX_TAG_FILTER } from "@/lib/tags";
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
 * `useReaderZone()`; validated server-side in
 * `resolveTimeZone`, which falls back to UTC rather than throwing.
 */
const timeZoneInput = z.string().optional();

/**
 * The calendar's visible grid: a journal, an inclusive run of the reader's
 * calendar days, and the reader zone they are read in.
 *
 * The range is cut into UTC instants here, during validation, so a malformed,
 * backwards or over-long range answers `BAD_REQUEST` — the caller's mistake —
 * instead of throwing from the handler, which would surface as a 500.
 */
const noteRangeInput = z
  .object({
    journalId: z.string(),
    /** `yyyy-MM-dd`, inclusive. */
    start: z.iso.date(),
    /** `yyyy-MM-dd`, inclusive. */
    end: z.iso.date(),
    timeZone: readerZoneInput,
  })
  .transform(({ journalId, start, end, timeZone: calendar }, ctx) => {
    try {
      return { journalId, calendar, window: calendar.rangeWindow(start, end) };
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: error instanceof Error ? error.message : "Invalid range",
      });
      return z.NEVER;
    }
  });

/** The longest a list row's preview may be, its ellipsis included. */
const PREVIEW_LENGTH = 160;

/**
 * A note's plain text as one line of at most `PREVIEW_LENGTH` characters, cut
 * on a word boundary. Done here rather than in the browser so the list never
 * ships whole notes just to show their first sentence.
 */
function previewOf(plainText: string): string {
  const text = plainText.replace(/\s+/g, " ").trim();

  if (text.length <= PREVIEW_LENGTH) return text;

  const room = text.slice(0, PREVIEW_LENGTH); // one past the budget for the body
  const lastSpace = room.lastIndexOf(" ");
  const body = lastSpace > 0 ? room.slice(0, lastSpace) : room.slice(0, -1);

  return `${body.trimEnd()}…`;
}

/** A position in the list's (createdAt, id) order. */
type ListPosition = { createdAt: Date; id: string };

/**
 * The list cursor, opaque to the client: `<ISO instant>_<note id>`. The id
 * breaks ties between notes written in the same millisecond, so a page
 * boundary falling between two of them neither drops nor repeats one.
 */
const encodeCursor = ({ createdAt, id }: ListPosition) =>
  `${createdAt.toISOString()}_${id}`;

const listCursorInput = z
  .string()
  .transform((value, ctx): ListPosition => {
    const split = value.indexOf("_");
    const createdAt = new Date(value.slice(0, split));
    const id = value.slice(split + 1);

    // The id may be empty: that is an anchor's position, handed back as the
    // newer cursor of a first page with nothing on or before its day.
    if (split < 0 || Number.isNaN(createdAt.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      return z.NEVER;
    }

    return { createdAt, id };
  });

/** Notes strictly older than `position` in the list's order. */
const olderThan = ({ createdAt, id }: ListPosition) => ({
  OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
});

/** Notes strictly newer than `position` in the list's order. */
const newerThan = ({ createdAt, id }: ListPosition) => ({
  OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
});

export const notesRouter = {
  createNote: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        timeZone: timeZoneInput,
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      // Written in the *writer's* zone, not the server's. `createdAt` is stamped
      // by Postgres in UTC, which is right for storage — but a title is read, and
      // on Vercel the server is UTC, so a note started at 09:52 IST came back
      // titled "at 4:22 AM". TZDate fixes the wall clock to `zone` and date-fns
      // v4 formats through it, the same trick `server/lib/reader-calendar.ts` uses.
      const zone = resolveTimeZone(input.timeZone);
      const defaultTitle = format(
        new TZDate(Date.now(), zone),
        "MMMM do, yyyy 'at' h:mm a",
      );

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
   * Still bounded. The reader calendar's `rangeWindow` caps the span at six
   * weeks (an over-long range is a `BAD_REQUEST`), which is what keeps
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
    .input(noteRangeInput)
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      // Cut in the reader zone, not the server's. On Vercel the server is UTC,
      // which would file a note written at 02:00 IST under the previous day.
      const { calendar, window } = input;

      const notes = await context.db.note.findMany({
        where: {
          ...ownedNoteWhere(context.userId),
          journalId: input.journalId,
          createdAt: {
            gte: window.start,
            lt: window.end,
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
          tags: tagSummary,
        },
        // Ascending, unlike the old day list: the time grid reads top-down, and
        // `packEvents` needs chronological order anyway.
        orderBy: {
          createdAt: "asc",
        },
      });

      return notes.map((note) => ({
        ...note,
        ...calendar.dayAndMinutesOf(note.createdAt),
      }));
    }),
  /**
   * The journal page's note list: every note in the journal, newest first,
   * each filed under the reader's calendar day.
   */
  listNotes: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        timeZone: readerZoneInput,
        /**
         * A previous page's `olderCursor` or `newerCursor`, with the matching
         * `direction`. Omitted for the first page.
         */
        cursor: listCursorInput.nullish(),
        direction: z.enum(["older", "newer"]).default("older"),
        /**
         * `yyyy-MM-dd`: the first page opens on this reader's calendar day
         * (the newest note on or before it) instead of on the newest note.
         * Ignored when `cursor` is given.
         */
        anchor: z.iso.date().optional(),
        /** Only notes carrying every one of these tags. */
        tagIds: z.array(z.string()).max(MAX_TAG_FILTER).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .handler(async ({ context, input }) => {
      const tagIds = input.tagIds ?? [];
      await Promise.all([
        assertJournalOwned(context, input.journalId),
        assertTagsOwned(context, tagIds),
      ]);

      // Applied to the page *and* to the look past its far side, so a
      // filtered list never offers a page of notes it would then hide.
      const inJournal = {
        ...ownedNoteWhere(context.userId),
        journalId: input.journalId,
        AND: tagIds.map((id) => ({ tags: { some: { id } } })),
      };

      // Where this page starts. An anchor is a position just past the end of
      // its day — the empty id sorts before every real one — so "older" takes
      // the day itself and "newer" starts at the next.
      const start: ListPosition | null =
        input.cursor ??
        (input.anchor
          ? {
              createdAt: input.timeZone.dayWindow(input.anchor).end,
              id: "",
            }
          : null);
      const newer = input.direction === "newer";

      // One extra row says whether another page exists, without a count.
      const rows = await context.db.note.findMany({
        where: {
          ...inJournal,
          ...(start ? (newer ? newerThan(start) : olderThan(start)) : {}),
        },
        take: input.limit + 1,
        select: {
          id: true,
          title: true,
          createdAt: true,
          plainText: true,
          tags: tagSummary,
        },
        // A newer page is read upward from its start, so it holds the notes
        // nearest it, then flipped to the list's newest-first order.
        orderBy: newer
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      });

      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      if (newer) page.reverse();

      const newest = page.at(0);
      const oldest = page.at(-1);

      // The far side of the page from where it was read: is anything beyond
      // it? Unanchored first pages start at the top, so nothing is newer.
      const beyond = newer ? (oldest ?? start) : (newest ?? start);
      const hasBeyond = beyond
        ? (await context.db.note.count({
            where: {
              ...inJournal,
              ...(newer ? olderThan(beyond) : newerThan(beyond)),
            },
            take: 1,
          })) > 0
        : false;

      const cursorIf = (exists: boolean, at: ListPosition | null | undefined) =>
        exists && at ? encodeCursor(at) : null;

      return {
        olderCursor: newer
          ? cursorIf(hasBeyond, beyond)
          : cursorIf(hasMore, oldest),
        newerCursor: newer
          ? cursorIf(hasMore, newest)
          : cursorIf(hasBeyond, beyond),
        notes: page.map(({ createdAt, plainText, ...note }) => ({
          ...note,
          day: input.timeZone.dayOf(createdAt),
          preview: previewOf(plainText ?? ""),
        })),
      };
    }),
  getNoteById: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      return findNote(context, input.noteId);
    }),
  saveNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        content: plateValue,
      }),
    )
    .handler(async ({ context, input }) => {
      await updateNote(context, input.noteId, {
        content: input.content,
        // Kept in step with content on every save. Postgres regenerates
        // searchVector from this automatically, so the index cannot fall behind.
        plainText: toPlainText(input.content),
      });

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
      await updateNote(context, input.noteId, { title: input.title });

      return { id: input.noteId, title: input.title };
    }),
  deleteNote: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      await deleteNote(context, input.noteId);

      return { id: input.noteId };
    }),
};
