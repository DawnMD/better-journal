import { ORPCError } from "@orpc/client";
import { HL_END, HL_START } from "@/lib/search";
import { MAX_TAG_FILTER } from "@/lib/tags";
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
      z
        .object({
          /**
           * May be empty, as long as tags are given. Picking a tag chip in the
           * palette clears the text: the text was how you *found* the facet, not
           * part of what you were searching for.
           */
          query: z.string().trim().max(200).default(""),
          /** Restrict to one journal. Omit to search everything the user owns. */
          journalId: z.string().optional(),
          /** AND semantics — a note must carry every one of these. */
          tagIds: z.array(z.string()).max(MAX_TAG_FILTER).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .refine(
          (value) =>
            value.query.length > 0 || (value.tagIds?.length ?? 0) > 0,
          { message: "Provide a query, a tag, or both." },
        ),
    )
    .handler(async ({ context, input }) => {
      if (input.journalId) {
        // Also enforces the journal's password lock.
        await assertJournalOwned(context, input.journalId);
      }

      const tagIds = [...new Set(input.tagIds ?? [])];

      if (tagIds.length > 0) {
        // Mirrors removeTagFromNote. Not load-bearing for confidentiality — the
        // results below are user-scoped regardless — but it turns "a tag id that
        // isn't yours" into an explicit refusal instead of a silent empty list,
        // which is the difference between a bug report and a mystery.
        const owned = await context.db.tag.count({
          where: { id: { in: tagIds }, userId: context.userId },
        });

        if (owned !== tagIds.length) throw new ORPCError("NOT_FOUND");
      }

      const hasQuery = input.query.length > 0;
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
      // Tag filtering extends this statement rather than adding a second
      // "browse by tag" query. The security predicates above exist in
      // exactly one place, and a parallel branch is precisely how one of them
      // gets left out of the copy. So when there is no text, `tsq` is NULL and
      // the match, the snippet and the rank each degrade in place: everything
      // matches, the snippet becomes a plain excerpt, and the rank flattens to 0
      // so the existing ORDER BY falls through to `createdAt DESC` on its own.
      //
      // The tag clause has AND semantics, expressed by counting a note's matched
      // join rows and requiring all of them. In `_NoteToTag`, "A" is the Note and
      // "B" is the Tag — per the foreign keys in the add_tags migration, and
      // reversing them returns zero rows silently rather than failing. The
      // `_NoteToTag_B_index` index serves the `B = ANY(...)` scan.
      const rows = await context.db.$queryRaw<SearchRow[]>`
        WITH q AS (
          SELECT CASE
            WHEN NOT ${hasQuery}::boolean THEN NULL
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
          CASE
            WHEN q.tsq IS NULL THEN left(coalesce(n."plainText", ''), 160)
            ELSE ts_headline(
              'english',
              coalesce(n."plainText", ''),
              q.tsq,
              ${HEADLINE_OPTIONS}
            )
          END AS "snippet",
          CASE
            WHEN q.tsq IS NULL THEN 0
            ELSE ts_rank(n."searchVector", q.tsq)
          END AS "rank"
        FROM "Note" n
        JOIN "Journal" j ON j."id" = n."journalId"
        CROSS JOIN q
        WHERE j."userId" = ${context.userId}
          AND j."trash" = false
          AND (${input.journalId ?? null}::text IS NULL OR n."journalId" = ${input.journalId ?? null})
          AND (q.tsq IS NULL OR n."searchVector" @@ q.tsq)
          AND (${tagIds.length}::int = 0 OR n."id" IN (
            SELECT nt."A"
            FROM "_NoteToTag" nt
            WHERE nt."B" = ANY(${tagIds}::text[])
            GROUP BY nt."A"
            HAVING count(*) = ${tagIds.length}::int
          ))
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
