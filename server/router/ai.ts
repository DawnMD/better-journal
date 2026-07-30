import { toPlainText } from "@/lib/plate";
import { resolveTimeZone } from "@/lib/timezone";
import { ORPCError } from "@orpc/server";
import z from "zod";
import { consumeAiQuota, readAiQuota } from "../lib/ai-rate-limit";
import { AI_BETAS, AI_FALLBACKS, AI_MODEL, anthropic, isRefusal, textOf } from "../lib/anthropic";
import { assertJournalOwned, assertNoteOwned } from "../lib/authorize";
import { dayWindow } from "../lib/day-window";
import { aiProcedure, protectedProcedure } from "../orpc";

/**
 * AI insights over a user's own journal entries.
 *
 * Every procedure here is an `aiProcedure`, which refuses unless the feature is
 * both enabled and configured — see server/orpc.ts. Every one also asserts
 * ownership of the journal whose entries it is about to send, so a request can
 * never put another user's writing into a prompt.
 */

/**
 * Hand-written JSON Schema rather than the SDK's `zodOutputFormat` helper.
 *
 * The project has a live zod-version skew between @hookform/resolvers and zod
 * (the thing that broke the build in the first place). Routing structured output
 * through another zod-coupled code path would put a second version constraint on
 * an already fragile edge, for no benefit — the schema is static, so generating
 * it buys nothing.
 */
const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: { type: "string" },
      description: "Recurring subjects across the entries, 2-6 short phrases.",
    },
    tone: {
      type: "string",
      description: "One or two sentences on the overall emotional tone.",
    },
    reflection: {
      type: "string",
      description:
        "A short, non-prescriptive reflection addressed to the writer. No advice unless the entries ask for it.",
    },
  },
  required: ["themes", "tone", "reflection"],
  additionalProperties: false,
} as const;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: { type: "string" },
      description: "1-4 short lowercase topic labels.",
    },
    mood: {
      type: "string",
      enum: [
        "positive",
        "negative",
        "mixed",
        "neutral",
        "anxious",
        "calm",
        "energised",
        "tired",
      ],
      description: "Single dominant mood label.",
    },
  },
  required: ["themes", "mood"],
  additionalProperties: false,
} as const;

/**
 * The stable half of the prompt, cached.
 *
 * Everything that varies — the entries, the question — comes after this, so the
 * prefix is byte-identical between requests and can actually be reused. Opus 5's
 * minimum cacheable prefix is 512 tokens, half Opus 4.8's, so even a system
 * prompt this size is worth a breakpoint.
 */
const SYSTEM_PROMPT = `You are a thoughtful reading companion for someone's private journal.

You are looking at entries the writer chose to share with you. Treat them as
private. Your job is to reflect what is actually there — recurring subjects, the
emotional register, what seems to be on their mind — not to diagnose, moralise,
or give unsolicited advice.

Guidelines:
- Quote or paraphrase only what the entries actually say. Do not invent detail.
- If the entries are sparse or repetitive, say so plainly rather than padding.
- Write to the person, in second person, plainly and without flattery.
- Never speculate about mental health conditions or suggest clinical action.
- If entries describe a crisis, respond with plain human warmth and suggest
  talking to someone they trust. Do not attempt to counsel.`;

type JournalEntry = {
  title: string | null;
  createdAt: Date;
  plainText: string | null;
  content: unknown;
};

/** Renders entries into a single stable text block for the prompt. */
function renderEntries(entries: JournalEntry[]): string {
  return entries
    .map((entry) => {
      const text = entry.plainText?.trim() || toPlainText(entry.content);
      const date = entry.createdAt.toISOString().slice(0, 10);
      return `--- ${date} · ${entry.title ?? "Untitled"} ---\n${text || "(empty)"}`;
    })
    .join("\n\n");
}

/**
 * Parses a structured-output response.
 *
 * `stop_reason` is checked before `content` is touched: on a refusal the array is
 * empty, so indexing it would throw a TypeError instead of surfacing the actual
 * reason.
 */
function parseStructured<T>(response: {
  stop_reason?: string | null;
  content: Array<{ type: string; text?: string }>;
}): T {
  if (isRefusal(response)) {
    throw new ORPCError("UNPROCESSABLE_CONTENT", {
      message:
        "The model declined to analyse these entries. This can happen with sensitive content.",
    });
  }

  const text = textOf(response);

  if (!text) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The model returned no content.",
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The model returned malformed JSON.",
    });
  }
}

export const aiRouter = {
  /** Remaining daily quota. Not an aiProcedure — the UI reads it to render state. */
  getQuota: protectedProcedure.input(z.void()).handler(async ({ context }) => {
    return readAiQuota(context.db, context.userId);
  }),
  /**
   * A week's worth of entries, summarised into themes, tone, and a reflection.
   */
  weeklySummary: aiProcedure
    .input(
      z.object({
        journalId: z.string(),
        /** Any date inside the week of interest, `yyyy-MM-dd`. */
        weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeZone: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      const zone = resolveTimeZone(input.timeZone);
      const { start } = dayWindow(input.weekOf, zone);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

      const entries = await context.db.note.findMany({
        where: {
          journalId: input.journalId,
          createdAt: { gte: start, lt: end },
        },
        select: {
          title: true,
          createdAt: true,
          plainText: true,
          content: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (entries.length === 0) {
        throw new ORPCError("NOT_FOUND", {
          message: "No entries in that week to summarise.",
        });
      }

      // Charged only once we know there is real work to do.
      await consumeAiQuota(context.db, context.userId);

      const response = await anthropic().beta.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        betas: AI_BETAS,
        fallbacks: AI_FALLBACKS,
        // No `thinking` field: on Opus 5 omitting it runs adaptive thinking,
        // which is what a summarisation task wants. Setting budget_tokens here
        // would be a 400.
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: SUMMARY_SCHEMA },
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Cache breakpoint on the last stable block. The entries and the
            // instruction below vary per request and sit after it.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Here are my journal entries for the week of ${input.weekOf}:\n\n${renderEntries(entries)}\n\nSummarise the recurring themes, the overall tone, and offer one short reflection.`,
          },
        ],
      });

      const parsed = parseStructured<{
        themes: string[];
        tone: string;
        reflection: string;
      }>(response);

      return {
        ...parsed,
        entryCount: entries.length,
        weekOf: input.weekOf,
        // Zero across repeated calls means something in the prefix is varying.
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      };
    }),
  /**
   * Extracts themes and a mood label for one entry, stored on the note so the
   * dashboard can chart mood over time without re-billing.
   */
  analyzeNote: aiProcedure
    .input(z.object({ noteId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertNoteOwned(context, input.noteId);

      const note = await context.db.note.findFirstOrThrow({
        where: { id: input.noteId },
        select: {
          id: true,
          title: true,
          plainText: true,
          content: true,
          updatedAt: true,
          aiAnalyzedAt: true,
          aiThemes: true,
          aiMood: true,
        },
      });

      // Skip re-analysis of an unchanged note rather than paying for the same
      // answer twice.
      if (note.aiAnalyzedAt && note.aiAnalyzedAt >= note.updatedAt) {
        return {
          themes: note.aiThemes,
          mood: note.aiMood,
          cached: true as const,
        };
      }

      const text = note.plainText?.trim() || toPlainText(note.content);

      if (!text) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This entry is empty.",
        });
      }

      await consumeAiQuota(context.db, context.userId);

      const response = await anthropic().beta.messages.create({
        model: AI_MODEL,
        max_tokens: 4096,
        betas: AI_BETAS,
        fallbacks: AI_FALLBACKS,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Extract themes and a mood label for this entry.\n\nTitle: ${note.title ?? "Untitled"}\n\n${text}`,
          },
        ],
      });

      const parsed = parseStructured<{ themes: string[]; mood: string }>(
        response,
      );

      await context.db.note.update({
        where: { id: note.id },
        data: {
          aiThemes: parsed.themes,
          aiMood: parsed.mood,
          aiAnalyzedAt: new Date(),
        },
      });

      return { ...parsed, cached: false as const };
    }),
  /** Mood counts over a range, for charting alongside the Phase 7 dashboard. */
  getMoodTrend: protectedProcedure
    .input(z.object({ journalId: z.string() }))
    .handler(async ({ context, input }) => {
      await assertJournalOwned(context, input.journalId);

      const rows = await context.db.note.groupBy({
        by: ["aiMood"],
        where: {
          journalId: input.journalId,
          aiMood: { not: null },
        },
        _count: { _all: true },
      });

      return rows
        .filter((row) => row.aiMood !== null)
        .map((row) => ({ mood: row.aiMood as string, count: row._count._all }));
    }),
};
