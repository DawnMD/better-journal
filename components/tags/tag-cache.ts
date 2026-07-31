import { orpc } from "@/lib/orpc.query";
import type { QueryClient } from "@tanstack/react-query";

/**
 * The cache fan-out every tag mutation shares.
 *
 * Four call sites — the editor's tag bar, the filter bar, the manager's rename
 * and its delete — all move the same three caches, and a list maintained
 * separately in each of them drifts the moment a fifth is added.
 *
 * The rule this follows, which is the one the rest of the app follows: **patch**
 * when the caller knows the exact key and the procedure hands back the new
 * value; **invalidate** when the blast radius is "every note that ever carried
 * this tag". So the patches stay at the call sites, where the returned value is,
 * and only the invalidations live here.
 *
 * `getNotesInRange` is invalidated *broadly*, by partial key. A tag can be
 * changed from the editor, which has no idea which calendar range or timezone is
 * cached — the same reason components/note-title.tsx invalidates broadly there.
 */
export function invalidateAfterTagChange(
  queryClient: QueryClient,
  scope: {
    /** Skip when the caller already patched `getAllTags` from the response. */
    allTags?: boolean;
    /** Skip when the caller already patched the one note it touched. */
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

  queryClient.invalidateQueries({
    queryKey: orpc.notesRouter.getNotesInRange.key(),
  });

  // Marked stale but not refetched: the palette is closed almost always, and it
  // already holds results for 30s. Firing a request at a dialog nobody is
  // looking at costs a round trip to repaint nothing.
  queryClient.invalidateQueries({
    queryKey: orpc.searchRouter.search.key(),
    refetchType: "none",
  });
}
