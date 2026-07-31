/**
 * Tag rules shared by the client and the server, the way lib/timezone.ts is.
 *
 * Normalisation in particular has to be the same function on both sides: the
 * rename dialog decides whether a draft collides with an existing tag *before*
 * it calls, and if its idea of "the same name" differed from the router's by so
 * much as a trailing space, the dialog would offer a merge the server would then
 * refuse — or worse, skip a merge the server was about to perform.
 */

export const MAX_TAG_NAME = 32;

/**
 * How many tags a filter may name at once. Matches the `.max(10)` on
 * `getNotesByTags` and `searchRouter.search`, so a URL that survives
 * `resolveTagIds` is always one the server will also accept.
 */
export const MAX_TAG_FILTER = 10;

/**
 * `"  Deep   Work "` → `"deep work"`.
 *
 * Trim, collapse runs of whitespace, lowercase. Without this "Work", "work " and
 * "work" become three tags that look identical in the UI, and the
 * ([userId, name]) unique constraint would not catch it.
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Roughly cuid-shaped. Not a validation of the id — the database decides that —
 * but a cheap gate that keeps `__proto__`, SQL fragments and 10 KB blobs from a
 * hand-edited query string out of a query key and out of a bind parameter.
 */
const ID_SHAPE = /^[a-z0-9]{20,40}$/i;

/**
 * Narrows an untrusted `?tags=` value to a list of ids.
 *
 * Same contract as `resolveView`/`resolveDayKey` in lib/calendar.ts: a
 * hand-edited query string has to degrade to "no filter", never to a 500. So
 * every rejection here is silent, and the cap is applied rather than treated as
 * an error.
 */
export function resolveTagIds(value: string | null | undefined): string[] {
  if (!value) return [];

  const seen = new Set<string>();

  for (const part of value.split(",")) {
    const id = part.trim();

    if (!ID_SHAPE.test(id)) continue;

    seen.add(id);

    if (seen.size >= MAX_TAG_FILTER) break;
  }

  return [...seen];
}

/** The inverse of `resolveTagIds`, for writing the filter back to the URL. */
export function serializeTagIds(tagIds: string[]): string {
  return tagIds.join(",");
}

/**
 * AND semantics, matching `getNotesByTags` and the search router's tag clause:
 * a note passes only when it carries *every* selected tag.
 *
 * This is the whole calendar filter. It runs over the already-fetched range so
 * that `notesByDay`, the per-cell counts, the "+N more" count and `packEvents`
 * all see one array and cannot disagree about it.
 */
export function hasAllTags(
  note: { tags: { id: string }[] },
  tagIds: string[],
): boolean {
  if (tagIds.length === 0) return true;

  const own = new Set(note.tags.map((tag) => tag.id));

  return tagIds.every((id) => own.has(id));
}
