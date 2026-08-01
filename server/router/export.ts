import { resolveTimeZone } from "@/lib/timezone";
import { ORPCError } from "@orpc/server";
import z from "zod";
import { assertJournalOwned } from "../lib/authorize";
import { dayWindow } from "../lib/day-window";
import { slugify, toMarkdown } from "../lib/markdown";
import { protectedProcedure } from "../orpc";

/**
 * Data portability: get your writing out.
 *
 * Markdown for reading, JSON for re-importing. Both go through
 * `assertJournalOwned` — an export endpoint that skipped the ownership check
 * would be the easiest way to read someone else's writing.
 *
 * PDF is deliberately not implemented. It is the least useful of the three and
 * the most dependency-heavy (a headless browser or a LaTeX toolchain in the
 * deploy image), and Markdown converts to PDF with any tool the user already
 * has. Shipping Markdown and JSON well beats shipping three formats poorly.
 */

const rangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .optional();

export const exportRouter = {
  exportJournal: protectedProcedure
    .input(
      z.object({
        journalId: z.string(),
        format: z.enum(["markdown", "json"]),
        range: rangeSchema,
        timeZone: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      const journal = await context.db.journal.findFirstOrThrow({
        where: { id: input.journalId },
        select: { title: true, description: true, createdAt: true },
      });

      const zone = resolveTimeZone(input.timeZone);

      // Range is bucketed in the reader's timezone, like everything else that
      // asks "which day is this" — see server/lib/day-window.ts.
      const where = input.range
        ? {
            journalId: input.journalId,
            createdAt: {
              gte: dayWindow(input.range.from, zone).start,
              lt: dayWindow(input.range.to, zone).end,
            },
          }
        : { journalId: input.journalId };

      const notes = await context.db.note.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          plainText: true,
          createdAt: true,
          updatedAt: true,
          aiThemes: true,
          aiMood: true,
          tags: { select: { name: true }, orderBy: { name: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      });

      if (notes.length === 0) {
        throw new ORPCError("NOT_FOUND", {
          message: "No entries to export in that range.",
        });
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const base = `${slugify(journal.title)}-${stamp}`;

      if (input.format === "json") {
        return {
          filename: `${base}.json`,
          contentType: "application/json",
          // Pretty-printed: the point of a JSON export is that a human can open
          // it and a script can read it, and 2-space indent costs nothing here.
          content: JSON.stringify(
            {
              journal: {
                title: journal.title,
                description: journal.description,
                createdAt: journal.createdAt,
              },
              exportedAt: new Date().toISOString(),
              timeZone: zone,
              notes: notes.map((note) => ({
                id: note.id,
                title: note.title,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
                tags: note.tags.map((tag) => tag.name),
                aiThemes: note.aiThemes,
                aiMood: note.aiMood,
                // Both shapes: `content` round-trips back into the editor,
                // `plainText` is what a script or grep actually wants.
                content: note.content,
                plainText: note.plainText,
              })),
            },
            null,
            2,
          ),
        };
      }

      const sections = notes.map((note) => {
        const heading = `## ${note.title ?? "Untitled"}`;
        const meta = [
          `*${note.createdAt.toISOString().slice(0, 10)}*`,
          note.tags.length > 0
            ? `Tags: ${note.tags.map((tag) => `\`${tag.name}\``).join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return `${heading}\n\n${meta}\n\n${toMarkdown(note.content).trim()}`;
      });

      const header = [
        `# ${journal.title}`,
        journal.description ? `\n${journal.description}` : null,
        `\n*${notes.length} ${notes.length === 1 ? "entry" : "entries"}, exported ${stamp}*`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        filename: `${base}.md`,
        contentType: "text/markdown",
        // `---` between entries so a long export stays skimmable.
        content: `${header}\n\n---\n\n${sections.join("\n\n---\n\n")}\n`,
      };
    }),
};
