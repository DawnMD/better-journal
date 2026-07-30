import { HL_END, HL_START } from "@/lib/search";
import z from "zod";
import { assertJournalOwned } from "../lib/authorize";
import { protectedProcedure } from "../orpc";

/**
 * Full-text search across the user's notes.
 *
 * Ranked with `ts_rank` against the weighted `searchVector` (title A, body B), and
 * snippeted with `ts_headline` so results show the matching phrase in context
 * rather than the first line of the entry.
 */

type SearchRow = {
  id: string;
  title: string | null;
  journalId: string;
  journalTitle: string;
  createdAt: Date;
  snippet: string;
  rank: number;
};

/**
 * Passed as a bind parameter, not inlined, so the delimiters can be real control
 * characters without needing SQL E'' escaping. See lib/search.ts for why they
 * are control characters rather than `<mark>`.
 */
const HEADLINE_OPTIONS = [
  `StartSel=${HL_START}`,
  `StopSel=${HL_END}`,
  "MaxWords=24",
  "MinWords=8",
  "ShortWord=2",
  "MaxFragments=1",
].join(", ");

/**
 * Two query dialects, because neither Postgres function does both jobs.
 *
 * - `to_tsquery` supports `:*` prefix matching, which a ⌘K palette needs to match
 *   "migr" against "migrations" while you are still typing. It also throws a
 *   syntax error on `&`, `|`, `!`, `(`, `:` — so it can only ever be handed tokens
 *   we have sanitised ourselves.
 * - `websearch_to_tsquery` accepts arbitrary free text and cannot be made to
 *   throw, and understands quoted phrases, `or`, and leading `-` for negation. It
 *   ignores `:*` entirely, so it cannot prefix-match.
 *
 * So: plain typing takes the prefix path, and anything with explicit search syntax
 * takes the websearch path. Both arrive at Postgres as bind parameters either way.
 */
type ParsedQuery =
  | { mode: "prefix"; value: string }
  | { mode: "websearch"; value: string };

/** True when the user has typed something only websearch syntax can express. */
function usesSearchSyntax(raw: string): boolean {
  return /["]|(^|\s)-\S|(^|\s)or(\s|$)/i.test(raw);
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();

  if (usesSearchSyntax(trimmed)) {
    return { mode: "websearch", value: trimmed };
  }

  // Letters and numbers only. Nothing that survives this can be a tsquery
  // operator, which is what makes the to_tsquery path safe.
  const tokens = trimmed.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  if (tokens.length === 0) {
    // Punctuation-only input. Hand it to the function that tolerates anything.
    return { mode: "websearch", value: trimmed };
  }

  const last = tokens.pop()!;

  // Only the final token is a prefix; earlier words are complete, so treating
  // them as prefixes would make "a note" match "another notebook".
  return { mode: "prefix", value: [...tokens, `${last}:*`].join(" & ") };
}

export const searchRouter = {
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(200),
        /** Restrict to one journal. Omit to search everything the user owns. */
        journalId: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.journalId) {
        // Also enforces the journal's password lock.
        await assertJournalOwned(context, input.journalId);
      }

      const parsed = parseSearchQuery(input.query);
      const isPrefix = parsed.mode === "prefix";

      // Everything interpolated is a bind parameter — `$queryRaw`'s tagged
      // template parameterises `${}` rather than concatenating, so the user's
      // query never becomes SQL text.
      //
      // The tsquery is built once in a CTE and cross-joined, so the match, the
      // ranking and the headline are guaranteed to use the identical query. Three
      // separate copies would be three chances to drift.
      //
      // `hashedPassword IS NULL` is the load-bearing clause: without it search
      // would return snippets from a locked journal, which is a read straight
      // through the password. Matching but redacting would still leak that a term
      // appears inside.
      const rows = await context.db.$queryRaw<SearchRow[]>`
        WITH q AS (
          SELECT CASE
            WHEN ${isPrefix}::boolean
              THEN to_tsquery('english', ${parsed.value})
            ELSE websearch_to_tsquery('english', ${parsed.value})
          END AS tsq
        )
        SELECT
          n."id",
          n."title",
          n."journalId",
          j."title" AS "journalTitle",
          n."createdAt",
          ts_headline(
            'english',
            coalesce(n."plainText", ''),
            q.tsq,
            ${HEADLINE_OPTIONS}
          ) AS "snippet",
          ts_rank(n."searchVector", q.tsq) AS "rank"
        FROM "Note" n
        JOIN "Journal" j ON j."id" = n."journalId"
        CROSS JOIN q
        WHERE j."userId" = ${context.userId}
          AND j."trash" = false
          AND j."hashedPassword" IS NULL
          AND (${input.journalId ?? null}::text IS NULL OR n."journalId" = ${input.journalId ?? null})
          AND n."searchVector" @@ q.tsq
        ORDER BY "rank" DESC, n."createdAt" DESC
        LIMIT ${input.limit}
      `;

      return rows.map((row) => ({
        ...row,
        // ts_rank comes back as float4; normalise to a plain number rather than
        // leaking a driver-specific numeric type to the client.
        rank: Number(row.rank),
      }));
    }),
};
