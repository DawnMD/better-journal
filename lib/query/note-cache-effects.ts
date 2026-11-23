import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { MutationKey, QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc.query";
import type { router } from "@/server/router";

type NoteInputs = InferRouterInputs<typeof router>["notesRouter"];
type NoteOutputs = InferRouterOutputs<typeof router>["notesRouter"];
type SearchResults = InferRouterOutputs<typeof router>["searchRouter"]["search"];

type Effect<P extends keyof NoteInputs> = (
  queryClient: QueryClient,
  data: NoteOutputs[P],
) => void;

/**
 * What each note mutation does to the cache, in one place.
 *
 * Keyed by procedure path, and applied centrally by the query client's mutation
 * cache (see `applyNoteCacheEffects`), so components only toast and navigate.
 */
export const noteCacheEffects: {
  [P in keyof NoteInputs]?: Effect<P>;
} = {
  createNote(queryClient) {
    // Invalidated, not patched: which cached ranges the new note falls in
    // depends on each range's reader zone, which only the server works out.
    queryClient.invalidateQueries({
      queryKey: orpc.notesRouter.getNotesInRange.key(),
    });
    staleSearch(queryClient);
    invalidateStats(queryClient);
  },

  saveNote(queryClient, data) {
    // Only the content changed, so only the content is patched — the calendar
    // shows titles, which a save never touches.
    patchNote(queryClient, data.id, { content: data.content });
    staleSearch(queryClient);
    // Word counts move with every save, and saves arrive every few seconds of
    // typing; refetching the dashboard behind the editor each time would be a
    // request per pause for a screen nobody is looking at.
    queryClient.invalidateQueries({
      queryKey: orpc.statsRouter.key(),
      refetchType: "none",
    });
  },

  renameNote(queryClient, data) {
    patchCalendarRanges(queryClient, (notes) =>
      notes.map((note) =>
        note.id === data.id ? { ...note, title: data.title } : note,
      ),
    );
    patchNote(queryClient, data.id, { title: data.title });
    staleSearch(queryClient);
  },

  deleteNote(queryClient, data) {
    // A patch rather than a refetch: the calendar counts its days from this
    // same list, so dropping the entry moves the day's badge too.
    patchCalendarRanges(queryClient, (notes) =>
      notes.filter((note) => note.id !== data.id),
    );
    queryClient.removeQueries({
      queryKey: orpc.notesRouter.getNoteById.queryKey({
        input: { noteId: data.id },
      }),
    });
    // Dropped from cached results as well as staled, so the palette cannot
    // offer a note that no longer exists before its next search.
    queryClient.setQueriesData<SearchResults>(
      { queryKey: orpc.searchRouter.search.key() },
      (prev) => prev?.filter((hit) => hit.id !== data.id),
    );
    staleSearch(queryClient);
    invalidateStats(queryClient);
  },
};

/** Note counts, streaks and word totals all move when a note comes or goes. */
function invalidateStats(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: orpc.statsRouter.key() });
}

/**
 * Every cached calendar range, matched by partial key: whoever fired the
 * mutation need not know the visible range or the reader zone.
 */
function patchCalendarRanges(
  queryClient: QueryClient,
  patch: (
    notes: NoteOutputs["getNotesInRange"],
  ) => NoteOutputs["getNotesInRange"],
) {
  queryClient.setQueriesData<NoteOutputs["getNotesInRange"]>(
    { queryKey: orpc.notesRouter.getNotesInRange.key() },
    (prev) => (prev ? patch(prev) : prev),
  );
}

function patchNote(
  queryClient: QueryClient,
  noteId: string,
  fields: Partial<NoteOutputs["getNoteById"]>,
) {
  queryClient.setQueryData(
    orpc.notesRouter.getNoteById.queryKey({ input: { noteId } }),
    (prev) => (prev ? { ...prev, ...fields } : prev),
  );
}

/**
 * Marked stale but not refetched: the search palette is closed almost always,
 * and a request fired at a dialog nobody is looking at repaints nothing.
 */
function staleSearch(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: orpc.searchRouter.search.key(),
    refetchType: "none",
  });
}

/**
 * The procedure path an oRPC mutation key names, e.g. `notesRouter.renameNote`.
 * oRPC's `mutationOptions()` sets `mutationKey` to `[path, { type: "mutation" }]`
 * on every mutation, so no per-call tagging (via `meta`) is needed.
 */
function procedurePath(mutationKey: MutationKey | undefined) {
  const path = mutationKey?.[0];
  return Array.isArray(path) ? path.join(".") : undefined;
}

/**
 * Applies the cache effects of a settled-successfully note mutation. Mutations
 * that are not note mutations are left alone.
 */
export function applyNoteCacheEffects(
  queryClient: QueryClient,
  mutationKey: MutationKey | undefined,
  data: unknown,
) {
  const path = procedurePath(mutationKey);
  if (!path?.startsWith("notesRouter.")) return;

  const effect = noteCacheEffects[
    path.slice("notesRouter.".length) as keyof NoteInputs
  ] as Effect<keyof NoteInputs> | undefined;

  effect?.(queryClient, data as NoteOutputs[keyof NoteInputs]);
}
