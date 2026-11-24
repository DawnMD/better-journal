import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { MutationKey, QueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc.query";
import type { router } from "@/server/router";

type Inputs = InferRouterInputs<typeof router>;
type Outputs = InferRouterOutputs<typeof router>;

type NoteOutputs = Outputs["notesRouter"];
type SearchResults = Outputs["searchRouter"]["search"];
type AllTags = Outputs["tagRouter"]["getAllTags"];

type Effect<R extends keyof Inputs, P extends keyof Inputs[R]> = (
  queryClient: QueryClient,
  data: Outputs[R][P & keyof Outputs[R]],
  variables: Inputs[R][P],
) => void;

type AnyEffect = (
  queryClient: QueryClient,
  data: unknown,
  variables: unknown,
) => void;

type CacheEffects = {
  [R in keyof Inputs]?: { [P in keyof Inputs[R]]?: Effect<R, P> };
};

/**
 * What each mutation does to the cache, in one place.
 *
 * Keyed by router, then procedure, and applied centrally by the query client's
 * mutation cache (see `applyCacheEffects`), so components only toast and
 * navigate.
 *
 * The rule throughout: **patch** when the procedure hands back the new value
 * and the affected entries can be found; **invalidate** when what changed is
 * only known to the server (which days a note falls on, how a merge moved
 * counts); **remove** what can no longer be read at all.
 */
export const cacheEffects: CacheEffects = {
  notesRouter: {
    createNote(queryClient) {
      // Invalidated, not patched: which cached ranges the new note falls in
      // depends on each range's reader zone, which only the server works out.
      invalidateCalendarRanges(queryClient);
      staleSearch(queryClient);
      invalidateStats(queryClient);
    },

    saveNote(queryClient, data) {
      // Only the content changed, so only the content is patched — the
      // calendar shows titles, which a save never touches.
      patchNote(queryClient, data.id, { content: data.content });
      staleSearch(queryClient);
      // Word counts move with every save, and saves arrive every few seconds
      // of typing; refetching the dashboard behind the editor each time would
      // be a request per pause for a screen nobody is looking at.
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
      dropSearchHits(queryClient, (hit) => hit.id === data.id);
      staleSearch(queryClient);
      invalidateStats(queryClient);
    },
  },

  journalRouter: {
    createJournal(queryClient) {
      invalidateLiveJournals(queryClient);
    },

    moveToTrash(queryClient, data) {
      // A trashed journal's notes can no longer be read, so whatever is cached
      // of them is removed outright rather than refetched into an error.
      queryClient.removeQueries({
        queryKey: orpc.notesRouter.getNotesInRange.key({
          input: { journalId: data.id },
        }),
      });
      queryClient.removeQueries({
        queryKey: orpc.notesRouter.getNoteById.key(),
        predicate: (query) =>
          (query.state.data as { journalId?: string } | undefined)
            ?.journalId === data.id,
      });
      // As with a deleted note: the palette must not offer them before its
      // next search.
      dropSearchHits(queryClient, (hit) => hit.journalId === data.id);
      staleSearch(queryClient);
      invalidateLiveJournals(queryClient);
      invalidateTrashedJournals(queryClient);
      invalidateStats(queryClient);
    },

    removeFromTrash(queryClient) {
      // Its notes come back into search and stats; its calendar was removed on
      // the way to the trash, so it is fetched fresh when next opened.
      staleSearch(queryClient);
      invalidateLiveJournals(queryClient);
      invalidateTrashedJournals(queryClient);
      invalidateStats(queryClient);
    },

    deletePermanently(queryClient) {
      // Only a trashed journal can be purged, and trashed journals are already
      // out of the live list, stats and search.
      invalidateTrashedJournals(queryClient);
    },
  },

  tagRouter: {
    addTagToNote(queryClient, data, variables) {
      setTagsForNote(queryClient, variables.noteId, data);
      invalidateAfterTagChange(queryClient, { tagsForNote: false });
    },

    removeTagFromNote(queryClient, data, variables) {
      setTagsForNote(queryClient, variables.noteId, data);
      invalidateAfterTagChange(queryClient, { tagsForNote: false });
    },

    renameTag(queryClient, data) {
      if (data.mergedFrom) {
        // Two rows became one, with note counts that depend on how much the
        // two tags overlapped. Reconstructing that here would be a second,
        // client-side implementation of the merge — so refetch instead.
        invalidateAfterTagChange(queryClient);
        return;
      }

      patchAllTags(queryClient, (tags) =>
        tags
          .map((tag) =>
            tag.id === data.id ? { ...tag, name: data.name } : tag,
          )
          // Re-sorted, because the list is name-ordered and the rename just
          // moved this row. Skipping this leaves it stranded until refetch.
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      invalidateAfterTagChange(queryClient, { allTags: false });
    },

    deleteTag(queryClient, data) {
      patchAllTags(queryClient, (tags) =>
        tags.filter((tag) => tag.id !== data.id),
      );
      invalidateAfterTagChange(queryClient, { allTags: false });
    },
  },
};

/** Note counts, streaks and word totals all move when a note comes or goes. */
function invalidateStats(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: orpc.statsRouter.key() });
}

function invalidateLiveJournals(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: orpc.journalRouter.getAllJournal.key(),
  });
}

function invalidateTrashedJournals(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: orpc.journalRouter.getTrashedJournal.key(),
  });
}

/**
 * Every cached calendar range, matched by partial key: whoever fired the
 * mutation need not know the visible range or the reader zone.
 */
function invalidateCalendarRanges(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: orpc.notesRouter.getNotesInRange.key(),
  });
}

/** Every cached calendar range, patched in place. See `invalidateCalendarRanges`. */
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

function dropSearchHits(
  queryClient: QueryClient,
  drop: (hit: SearchResults[number]) => boolean,
) {
  queryClient.setQueriesData<SearchResults>(
    { queryKey: orpc.searchRouter.search.key() },
    (prev) => prev?.filter((hit) => !drop(hit)),
  );
}

/** Both note-tag mutations return the note's full tag list. */
function setTagsForNote(
  queryClient: QueryClient,
  noteId: string,
  tags: Outputs["tagRouter"]["getTagsForNote"],
) {
  queryClient.setQueryData(
    orpc.tagRouter.getTagsForNote.queryKey({ input: { noteId } }),
    tags,
  );
}

function patchAllTags(
  queryClient: QueryClient,
  patch: (tags: AllTags) => AllTags,
) {
  queryClient.setQueryData(orpc.tagRouter.getAllTags.queryKey(), (prev) =>
    prev ? patch(prev) : prev,
  );
}

/**
 * The fan-out every tag change shares, beyond what its effect patched.
 *
 * `getNotesInRange` is invalidated broadly, by partial key: a tag can change
 * from the editor, which has no idea which calendar range or zone is cached.
 */
function invalidateAfterTagChange(
  queryClient: QueryClient,
  scope: {
    /** Skip when the effect already patched `getAllTags`. */
    allTags?: boolean;
    /** Skip when the effect already patched the one note it touched. */
    tagsForNote?: boolean;
  } = {},
) {
  const { allTags = true, tagsForNote = true } = scope;

  if (allTags) {
    queryClient.invalidateQueries({
      queryKey: orpc.tagRouter.getAllTags.key(),
    });
  }

  if (tagsForNote) {
    queryClient.invalidateQueries({
      queryKey: orpc.tagRouter.getTagsForNote.key(),
    });
  }

  invalidateCalendarRanges(queryClient);
  staleSearch(queryClient);
}

/**
 * The procedure path an oRPC mutation key names, e.g.
 * `["notesRouter", "renameNote"]`. oRPC's `mutationOptions()` sets
 * `mutationKey` to `[path, { type: "mutation" }]` on every mutation, so no
 * per-call tagging (via `meta`) is needed.
 */
function procedurePath(mutationKey: MutationKey | undefined) {
  const path = mutationKey?.[0];
  return Array.isArray(path) && path.length === 2
    ? (path as [string, string])
    : undefined;
}

/**
 * Applies the cache effects of a mutation that settled successfully. Mutations
 * with no entry in the table are left alone.
 */
export function applyCacheEffects(
  queryClient: QueryClient,
  mutationKey: MutationKey | undefined,
  data: unknown,
  variables: unknown,
) {
  const path = procedurePath(mutationKey);
  if (!path) return;

  const [routerName, procedure] = path;
  const effect = (
    cacheEffects as Record<
      string,
      Record<string, AnyEffect | undefined> | undefined
    >
  )[routerName]?.[procedure];

  effect?.(queryClient, data, variables);
}
