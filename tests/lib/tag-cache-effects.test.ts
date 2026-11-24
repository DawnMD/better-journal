import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { run, state, watch } from "@/tests/helpers/cache-effects";

/**
 * Tag cache effects, through the same central mutation-cache hook as note
 * effects (see tests/helpers/cache-effects.ts).
 */

const NOTE = "note-1";
const OTHER = "note-2";

const tag = (id: string, name: string, noteCount = 1) => ({
  id,
  name,
  noteCount,
});

const allTagsKey = orpc.tagRouter.getAllTags.queryKey();
const noteTagsKey = orpc.tagRouter.getTagsForNote.queryKey({
  input: { noteId: NOTE },
});
const otherTagsKey = orpc.tagRouter.getTagsForNote.queryKey({
  input: { noteId: OTHER },
});
const monthKey = orpc.notesRouter.getNotesInRange.queryKey({
  input: {
    journalId: "journal-1",
    start: "2026-10-26",
    end: "2026-12-06",
    timeZone: "UTC",
  },
});
const searchKey = orpc.searchRouter.search.queryKey({
  input: { query: "walk", limit: 20 },
});
const totalsKey = orpc.statsRouter.getTotals.queryKey({
  input: { timeZone: "UTC" },
});

/** All tags, two notes' tags, a calendar range, a search and stats. */
function seededClient() {
  const queryClient = getQueryClient();

  queryClient.setQueryData(allTagsKey, [
    tag("tag-b", "beach"),
    tag("tag-h", "hike", 2),
  ]);
  queryClient.setQueryData(noteTagsKey, [{ id: "tag-h", name: "hike" }]);
  queryClient.setQueryData(otherTagsKey, [{ id: "tag-h", name: "hike" }]);
  queryClient.setQueryData(monthKey, [
    {
      id: NOTE,
      title: "Morning",
      createdAt: new Date("2026-11-20T09:00:00Z"),
      tags: [{ id: "tag-h", name: "hike" }],
      day: "2026-11-20",
      minutes: 540,
    },
  ]);
  queryClient.setQueryData(searchKey, []);
  queryClient.setQueryData(totalsKey, {
    journals: 1,
    notes: 2,
    words: 10,
    daysActive: 1,
    firstEntry: new Date("2026-11-20T09:00:00Z"),
  });

  return queryClient;
}

/** What every tag change shares: calendar refetched, search staled, stats untouched. */
function expectCalendarAndSearchRefreshed(
  queryClient: QueryClient,
  month: { fetches: () => number },
  search: { fetches: () => number },
) {
  expect(month.fetches()).toBe(1);
  expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
  expect(search.fetches()).toBe(0);
  expect(state(queryClient, totalsKey)?.isInvalidated).toBe(false);
}

describe.each([
  ["addTagToNote", orpc.tagRouter.addTagToNote.mutationOptions(), { noteId: NOTE, name: "beach" }],
  ["removeTagFromNote", orpc.tagRouter.removeTagFromNote.mutationOptions(), { noteId: NOTE, tagId: "tag-h" }],
] as const)("%s cache effects", (_name, options, variables) => {
  const response = [{ id: "tag-b", name: "beach" }];

  it("sets the note's tags from the response and invalidates all tags", async () => {
    const queryClient = seededClient();
    const noteTags = watch(queryClient, noteTagsKey);
    const allTags = watch(queryClient, allTagsKey);

    await run(queryClient, options, variables, response);

    expect(queryClient.getQueryData(noteTagsKey)).toEqual(response);
    expect(noteTags.fetches()).toBe(0);
    expect(allTags.fetches()).toBe(1);
    expect(state(queryClient, otherTagsKey)?.isInvalidated).toBe(false);
  });

  it("refetches the calendar and marks search stale without refetching", async () => {
    const queryClient = seededClient();
    const month = watch(queryClient, monthKey);
    const search = watch(queryClient, searchKey);

    await run(queryClient, options, variables, response);

    expectCalendarAndSearchRefreshed(queryClient, month, search);
  });
});

describe("renameTag cache effects", () => {
  it("renames the tag in all tags and keeps the list in name order", async () => {
    const queryClient = seededClient();
    const allTags = watch(queryClient, allTagsKey);

    await run(
      queryClient,
      orpc.tagRouter.renameTag.mutationOptions(),
      { tagId: "tag-h", name: "alps" },
      { id: "tag-h", name: "alps", mergedFrom: null },
    );

    expect(queryClient.getQueryData(allTagsKey)).toEqual([
      tag("tag-h", "alps", 2),
      tag("tag-b", "beach"),
    ]);
    expect(allTags.fetches()).toBe(0);
  });

  it("invalidates every note's tags, refetches the calendar and stales search", async () => {
    const queryClient = seededClient();
    const noteTags = watch(queryClient, noteTagsKey);
    const month = watch(queryClient, monthKey);
    const search = watch(queryClient, searchKey);

    await run(
      queryClient,
      orpc.tagRouter.renameTag.mutationOptions(),
      { tagId: "tag-h", name: "alps" },
      { id: "tag-h", name: "alps", mergedFrom: null },
    );

    expect(noteTags.fetches()).toBe(1);
    expect(state(queryClient, otherTagsKey)?.isInvalidated).toBe(true);
    expectCalendarAndSearchRefreshed(queryClient, month, search);
  });

  it("refetches all tags after a merge rather than patching", async () => {
    const queryClient = seededClient();
    const allTags = watch(queryClient, allTagsKey);
    const noteTags = watch(queryClient, noteTagsKey);
    const month = watch(queryClient, monthKey);
    const search = watch(queryClient, searchKey);

    await run(
      queryClient,
      orpc.tagRouter.renameTag.mutationOptions(),
      { tagId: "tag-h", name: "beach", merge: true },
      { id: "tag-b", name: "beach", mergedFrom: "tag-h" },
    );

    expect(allTags.fetches()).toBe(1);
    expect(noteTags.fetches()).toBe(1);
    expectCalendarAndSearchRefreshed(queryClient, month, search);
  });
});

describe("deleteTag cache effects", () => {
  const deleteTag = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.tagRouter.deleteTag.mutationOptions(),
      { tagId: "tag-h" },
      { id: "tag-h" },
    );

  it("drops the tag from all tags without refetching it", async () => {
    const queryClient = seededClient();
    const allTags = watch(queryClient, allTagsKey);

    await deleteTag(queryClient);

    expect(queryClient.getQueryData(allTagsKey)).toEqual([
      tag("tag-b", "beach"),
    ]);
    expect(allTags.fetches()).toBe(0);
  });

  it("invalidates every note's tags, refetches the calendar and stales search", async () => {
    const queryClient = seededClient();
    const noteTags = watch(queryClient, noteTagsKey);
    const month = watch(queryClient, monthKey);
    const search = watch(queryClient, searchKey);

    await deleteTag(queryClient);

    expect(noteTags.fetches()).toBe(1);
    expect(state(queryClient, otherTagsKey)?.isInvalidated).toBe(true);
    expectCalendarAndSearchRefreshed(queryClient, month, search);
  });
});
