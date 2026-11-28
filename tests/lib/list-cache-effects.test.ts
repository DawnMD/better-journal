import { describe, expect, it, vi } from "vitest";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { listNotesOptions } from "@/lib/query/list-notes";
import { run, state, watch } from "@/tests/helpers/cache-effects";

/**
 * What mutations do to the journal page's cached note list, through the same
 * central mutation-cache hook as every other effect (see
 * tests/helpers/cache-effects.ts).
 *
 * The list holds titles, previews, tags and which notes exist at all, so every
 * mutation that changes one of those has to reach it — matched broadly, since a
 * mutation fired from the editor knows nothing of the list's anchor, filter or
 * zone.
 */

const JOURNAL = "journal-1";
const OTHER_JOURNAL = "journal-2";
const NOTE = "note-1";

const listKey = (journalId: string, extra: object = {}) =>
  listNotesOptions({ journalId, timeZone: "UTC", tagIds: [], ...extra })
    .queryKey;

const plainList = listKey(JOURNAL);
const anchoredFilteredList = listKey(JOURNAL, {
  anchor: "2026-11-20",
  tagIds: ["tag-h"],
  timeZone: "Asia/Kolkata",
});
const otherJournalList = listKey(OTHER_JOURNAL);

const page = (id: string) => ({
  pages: [
    {
      notes: [
        { id, title: "Morning", day: "2026-11-20", tags: [], preview: "a walk" },
      ],
      olderCursor: null,
      newerCursor: null,
    },
  ],
  pageParams: [null],
});

function seededClient() {
  const queryClient = getQueryClient();

  queryClient.setQueryData(plainList, page(NOTE));
  queryClient.setQueryData(anchoredFilteredList, page(NOTE));
  queryClient.setQueryData(otherJournalList, page("note-2"));

  return queryClient;
}

describe.each([
  [
    "createNote",
    orpc.notesRouter.createNote.mutationOptions(),
    { journalId: JOURNAL },
    { id: "note-3" },
  ],
  [
    "renameNote",
    orpc.notesRouter.renameNote.mutationOptions(),
    { noteId: NOTE, title: "Sunrise" },
    { id: NOTE, title: "Sunrise" },
  ],
  [
    "deleteNote",
    orpc.notesRouter.deleteNote.mutationOptions(),
    { noteId: NOTE },
    { id: NOTE },
  ],
  [
    "addTagToNote",
    orpc.tagRouter.addTagToNote.mutationOptions(),
    { noteId: NOTE, name: "hike" },
    [{ id: "tag-h", name: "hike" }],
  ],
  [
    "removeTagFromNote",
    orpc.tagRouter.removeTagFromNote.mutationOptions(),
    { noteId: NOTE, tagId: "tag-h" },
    [],
  ],
  [
    "renameTag",
    orpc.tagRouter.renameTag.mutationOptions(),
    { tagId: "tag-h", name: "walk" },
    { id: "tag-h", name: "walk", mergedFrom: null },
  ],
  [
    "deleteTag",
    orpc.tagRouter.deleteTag.mutationOptions(),
    { tagId: "tag-h" },
    { id: "tag-h" },
  ],
] as const)("%s refreshes the note list", (_, options, variables, response) => {
  it("refetches every open list, whatever its anchor, filter or zone", async () => {
    const queryClient = seededClient();
    const plain = watch(queryClient, plainList);
    const anchored = watch(queryClient, anchoredFilteredList);

    await run(queryClient, options, variables, response);

    await vi.waitFor(() => {
      expect(plain.fetches()).toBe(1);
      expect(anchored.fetches()).toBe(1);
    });
  });
});

describe("saveNote and the note list", () => {
  it("marks the list stale without refetching it behind the editor", async () => {
    const queryClient = seededClient();
    const plain = watch(queryClient, plainList);

    await run(
      queryClient,
      orpc.notesRouter.saveNote.mutationOptions(),
      { noteId: NOTE, content: [{ type: "p", children: [{ text: "x" }] }] },
      { id: NOTE, content: [{ type: "p", children: [{ text: "x" }] }] },
    );

    // The preview may have changed, so it is refetched when the list is next
    // shown — but not once per pause in typing.
    expect(state(queryClient, plainList)?.isInvalidated).toBe(true);
    expect(plain.fetches()).toBe(0);
  });
});

describe("moveToTrash and the note list", () => {
  it("removes the trashed journal's lists, and only its own", async () => {
    const queryClient = seededClient();

    await run(
      queryClient,
      orpc.journalRouter.moveToTrash.mutationOptions(),
      { id: JOURNAL },
      { id: JOURNAL },
    );

    expect(state(queryClient, plainList)).toBeUndefined();
    expect(state(queryClient, anchoredFilteredList)).toBeUndefined();
    expect(state(queryClient, otherJournalList)?.isInvalidated).toBe(false);
  });
});
