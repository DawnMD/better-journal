import { orpc } from "@/lib/orpc.query";

/** Where a list page is read from: `null` for the first page. */
export type ListPageParam = {
  cursor: string;
  direction: "older" | "newer";
} | null;

/**
 * The journal page's note list as one infinite query, built in one place for
 * the server prefetch and the client alike: two builders would hash to two keys
 * and turn every first paint into a cache miss.
 *
 * Pages run newest first. Scrolling down fetches the *next* page (older);
 * scrolling up from an anchored list fetches the *previous* one (newer).
 */
export function listNotesOptions({
  journalId,
  timeZone,
  anchor,
  tagIds,
}: {
  journalId: string;
  timeZone: string;
  /** `?date=`, or undefined to open on the newest note. */
  anchor?: string;
  tagIds: readonly string[];
}) {
  // Absent rather than undefined or empty, so a plain list and a filtered or
  // anchored one never differ by a key that means nothing.
  const base = {
    journalId,
    timeZone,
    ...(anchor ? { anchor } : {}),
    ...(tagIds.length > 0 ? { tagIds: [...tagIds] } : {}),
  };

  return orpc.notesRouter.listNotes.infiniteOptions({
    input: (page: ListPageParam) => (page ? { ...base, ...page } : base),
    initialPageParam: null as ListPageParam,
    getNextPageParam: (last): ListPageParam | undefined =>
      last.olderCursor
        ? { cursor: last.olderCursor, direction: "older" }
        : undefined,
    getPreviousPageParam: (first): ListPageParam | undefined =>
      first.newerCursor
        ? { cursor: first.newerCursor, direction: "newer" }
        : undefined,
  });
}
