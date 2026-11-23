import {
  MutationObserver,
  QueryObserver,
  type QueryClient,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";

/**
 * Note cache effects, exercised the way the app triggers them: a note mutation
 * built from the real oRPC `mutationOptions` (so its real mutation key) runs on
 * the app's real QueryClient, and the central mutation-cache hook does the rest.
 * Only the network is replaced — `mutationFn` returns what the procedure would.
 */

const JOURNAL = "journal-1";
const NOTE = "note-1";
const OTHER = "note-2";

const calendarNote = (id: string, title: string) => ({
  id,
  title,
  createdAt: new Date("2026-11-20T09:00:00Z"),
  tags: [],
  day: "2026-11-20",
  minutes: 540,
});

const monthKey = orpc.notesRouter.getNotesInRange.queryKey({
  input: {
    journalId: JOURNAL,
    start: "2026-10-26",
    end: "2026-12-06",
    timeZone: "Asia/Kolkata",
  },
});
const weekKey = orpc.notesRouter.getNotesInRange.queryKey({
  input: {
    journalId: JOURNAL,
    start: "2026-11-16",
    end: "2026-11-22",
    timeZone: "UTC",
  },
});
const noteKey = orpc.notesRouter.getNoteById.queryKey({
  input: { noteId: NOTE },
});
const searchKey = orpc.searchRouter.search.queryKey({
  input: { query: "walk", limit: 20 },
});
const totalsKey = orpc.statsRouter.getTotals.queryKey({
  input: { timeZone: "UTC" },
});

const searchHit = (id: string, title: string) => ({
  id,
  title,
  journalId: JOURNAL,
  journalTitle: "Daily",
  createdAt: new Date("2026-11-20T09:00:00Z"),
  snippet: "a walk",
  rank: 0.5,
});

/** A query client holding two calendar ranges, the note, a search and stats. */
function seededClient() {
  const queryClient = getQueryClient();

  queryClient.setQueryData(monthKey, [
    calendarNote(NOTE, "Morning"),
    calendarNote(OTHER, "Evening"),
  ]);
  queryClient.setQueryData(weekKey, [calendarNote(NOTE, "Morning")]);
  queryClient.setQueryData(noteKey, {
    id: NOTE,
    journalId: JOURNAL,
    title: "Morning",
    content: [{ type: "p", children: [{ text: "old" }] }],
    createdAt: new Date("2026-11-20T09:00:00Z"),
    updatedAt: new Date("2026-11-20T09:00:00Z"),
  });
  queryClient.setQueryData(searchKey, [
    searchHit(NOTE, "Morning"),
    searchHit(OTHER, "Evening"),
  ]);
  queryClient.setQueryData(totalsKey, {
    journals: 1,
    notes: 2,
    words: 10,
    daysActive: 1,
    firstEntry: new Date("2026-11-20T09:00:00Z"),
  });

  return queryClient;
}

/** Runs a mutation through the query client as `useMutation` would. */
async function run<TData, TVariables>(
  queryClient: QueryClient,
  options: { mutationKey?: readonly unknown[] },
  variables: TVariables,
  response: TData,
) {
  const observer = new MutationObserver<TData, Error, TVariables>(queryClient, {
    ...options,
    mutationFn: async () => response,
  });
  await observer.mutate(variables);
}

const state = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  queryClient.getQueryState(queryKey);

/**
 * Mounts an observer on a seeded entry, as an open screen would, and counts the
 * network requests it makes — so "staled without refetching" is observable.
 */
function watch(queryClient: QueryClient, queryKey: readonly unknown[]) {
  let fetches = 0;
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: async () => {
      fetches += 1;
      return queryClient.getQueryData(queryKey) ?? null;
    },
  });
  observer.subscribe(() => {});

  return { fetches: () => fetches };
}

describe("renameNote cache effects", () => {
  it("patches the title in every cached calendar range", async () => {
    const queryClient = seededClient();

    await run(
      queryClient,
      orpc.notesRouter.renameNote.mutationOptions(),
      { noteId: NOTE, title: "Sunrise" },
      { id: NOTE, title: "Sunrise" },
    );

    expect(
      queryClient.getQueryData(monthKey)?.map((note) => note.title),
    ).toEqual(["Sunrise", "Evening"]);
    expect(
      queryClient.getQueryData(weekKey)?.map((note) => note.title),
    ).toEqual(["Sunrise"]);
    expect(state(queryClient, monthKey)?.isInvalidated).toBe(false);
  });

  it("patches the cached note's title", async () => {
    const queryClient = seededClient();

    await run(
      queryClient,
      orpc.notesRouter.renameNote.mutationOptions(),
      { noteId: NOTE, title: "Sunrise" },
      { id: NOTE, title: "Sunrise" },
    );

    expect(queryClient.getQueryData(noteKey)?.title).toBe("Sunrise");
  });

  it("marks search stale without refetching, and leaves stats alone", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);
    const totals = watch(queryClient, totalsKey);

    await run(
      queryClient,
      orpc.notesRouter.renameNote.mutationOptions(),
      { noteId: NOTE, title: "Sunrise" },
      { id: NOTE, title: "Sunrise" },
    );

    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
    expect(state(queryClient, totalsKey)?.isInvalidated).toBe(false);
    expect(totals.fetches()).toBe(0);
  });
});

describe("deleteNote cache effects", () => {
  const deleteNote = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.notesRouter.deleteNote.mutationOptions(),
      { noteId: NOTE },
      { id: NOTE },
    );

  it("drops the note from every cached calendar range", async () => {
    const queryClient = seededClient();

    await deleteNote(queryClient);

    expect(queryClient.getQueryData(monthKey)?.map((note) => note.id)).toEqual(
      [OTHER],
    );
    expect(queryClient.getQueryData(weekKey)).toEqual([]);
    expect(state(queryClient, monthKey)?.isInvalidated).toBe(false);
  });

  it("removes the cached note", async () => {
    const queryClient = seededClient();

    await deleteNote(queryClient);

    expect(queryClient.getQueryState(noteKey)).toBeUndefined();
  });

  it("drops the note from cached search results and marks search stale without refetching", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);

    await deleteNote(queryClient);

    expect(
      queryClient.getQueryData(searchKey)?.map((hit) => hit.id),
    ).toEqual([OTHER]);
    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
  });

  it("invalidates stats", async () => {
    const queryClient = seededClient();
    const totals = watch(queryClient, totalsKey);

    await deleteNote(queryClient);

    // Refetched straight away by the open screen, which also clears the
    // invalidated flag, so the request is the evidence.
    expect(totals.fetches()).toBe(1);
  });
});

describe("saveNote cache effects", () => {
  const content = [{ type: "p", children: [{ text: "new" }] }];
  const saveNote = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.notesRouter.saveNote.mutationOptions(),
      { noteId: NOTE, content },
      { id: NOTE, content },
    );

  it("patches the cached note's content and leaves its title", async () => {
    const queryClient = seededClient();

    await saveNote(queryClient);

    expect(queryClient.getQueryData(noteKey)).toMatchObject({
      title: "Morning",
      content,
    });
  });

  it("marks search and stats stale without refetching either", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);
    const totals = watch(queryClient, totalsKey);

    await saveNote(queryClient);

    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(state(queryClient, totalsKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
    expect(totals.fetches()).toBe(0);
  });

  it("leaves the calendar ranges alone", async () => {
    const queryClient = seededClient();
    const month = watch(queryClient, monthKey);

    await saveNote(queryClient);

    expect(state(queryClient, monthKey)?.isInvalidated).toBe(false);
    expect(month.fetches()).toBe(0);
  });
});

describe("createNote cache effects", () => {
  const createNote = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.notesRouter.createNote.mutationOptions(),
      { journalId: JOURNAL, timeZone: "UTC" },
      {
        id: "note-3",
        journalId: JOURNAL,
        title: "November 23rd, 2026 at 9:00 AM",
        content: [],
        plainText: "",
        createdAt: new Date("2026-11-23T09:00:00Z"),
        updatedAt: new Date("2026-11-23T09:00:00Z"),
      },
    );

  it("invalidates every cached calendar range", async () => {
    const queryClient = seededClient();
    const month = watch(queryClient, monthKey);

    await createNote(queryClient);

    // The range on screen refetches; the one that is not is merely staled.
    expect(month.fetches()).toBe(1);
    expect(state(queryClient, weekKey)?.isInvalidated).toBe(true);
  });

  it("invalidates stats and marks search stale without refetching", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);
    const totals = watch(queryClient, totalsKey);

    await createNote(queryClient);

    expect(totals.fetches()).toBe(1);
    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
  });

  it("leaves the cached note alone", async () => {
    const queryClient = seededClient();

    await createNote(queryClient);

    expect(state(queryClient, noteKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(noteKey)?.title).toBe("Morning");
  });
});

describe("mutations that are not note mutations", () => {
  it("leave every note cache alone", async () => {
    const queryClient = seededClient();

    await run(
      queryClient,
      orpc.journalRouter.createJournal.mutationOptions(),
      { title: "Work" },
      { id: "journal-2" },
    );

    for (const key of [monthKey, weekKey, noteKey, searchKey, totalsKey]) {
      expect(state(queryClient, key)?.isInvalidated).toBe(false);
    }
  });
});
