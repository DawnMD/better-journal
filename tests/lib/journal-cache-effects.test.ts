import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { run, state, watch } from "@/tests/helpers/cache-effects";

/**
 * Journal cache effects, through the same central mutation-cache hook as note
 * effects (see tests/helpers/cache-effects.ts).
 */

const TRASHED = "journal-1";
const KEPT = "journal-2";

const calendarNote = (id: string) => ({
  id,
  title: id,
  createdAt: new Date("2026-11-20T09:00:00Z"),
  tags: [],
  day: "2026-11-20",
  minutes: 540,
});

const rangeKey = (journalId: string, timeZone: string) =>
  orpc.notesRouter.getNotesInRange.queryKey({
    input: { journalId, start: "2026-10-26", end: "2026-12-06", timeZone },
  });
const trashedMonthKey = rangeKey(TRASHED, "Asia/Kolkata");
const trashedUtcMonthKey = rangeKey(TRASHED, "UTC");
const keptMonthKey = rangeKey(KEPT, "UTC");

const noteKey = (noteId: string) =>
  orpc.notesRouter.getNoteById.queryKey({ input: { noteId } });
const trashedNoteKey = noteKey("note-1");
const keptNoteKey = noteKey("note-2");

const searchKey = orpc.searchRouter.search.queryKey({
  input: { query: "walk", limit: 20 },
});
const totalsKey = orpc.statsRouter.getTotals.queryKey({
  input: { timeZone: "UTC" },
});
const liveKey = orpc.journalRouter.getAllJournal.queryKey();
const trashKey = orpc.journalRouter.getTrashedJournal.queryKey();

const journal = (id: string, trash: boolean) => ({
  id,
  title: id,
  description: null,
  userId: "user-1",
  trash,
  createdAt: new Date("2026-11-01T09:00:00Z"),
  updatedAt: new Date("2026-11-01T09:00:00Z"),
});

const note = (id: string, journalId: string) => ({
  id,
  journalId,
  title: id,
  content: [{ type: "p", children: [{ text: "a walk" }] }],
  createdAt: new Date("2026-11-20T09:00:00Z"),
  updatedAt: new Date("2026-11-20T09:00:00Z"),
});

const searchHit = (id: string, journalId: string) => ({
  id,
  title: id,
  journalId,
  journalTitle: journalId,
  createdAt: new Date("2026-11-20T09:00:00Z"),
  snippet: "a walk",
  rank: 0.5,
});

/** Two journals' calendars and notes, a search over both, stats and both lists. */
function seededClient() {
  const queryClient = getQueryClient();

  queryClient.setQueryData(trashedMonthKey, [calendarNote("note-1")]);
  queryClient.setQueryData(trashedUtcMonthKey, [calendarNote("note-1")]);
  queryClient.setQueryData(keptMonthKey, [calendarNote("note-2")]);
  queryClient.setQueryData(trashedNoteKey, note("note-1", TRASHED));
  queryClient.setQueryData(keptNoteKey, note("note-2", KEPT));
  queryClient.setQueryData(searchKey, [
    searchHit("note-1", TRASHED),
    searchHit("note-2", KEPT),
  ]);
  queryClient.setQueryData(totalsKey, {
    journals: 2,
    notes: 2,
    words: 4,
    daysActive: 1,
    firstEntry: new Date("2026-11-20T09:00:00Z"),
  });
  queryClient.setQueryData(liveKey, [journal(TRASHED, false), journal(KEPT, false)]);
  queryClient.setQueryData(trashKey, []);

  return queryClient;
}

describe("moveToTrash cache effects", () => {
  const trash = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.journalRouter.moveToTrash.mutationOptions(),
      { id: TRASHED },
      { id: TRASHED },
    );

  it("removes the journal's cached calendar ranges in every zone, and only its own", async () => {
    const queryClient = seededClient();

    await trash(queryClient);

    expect(state(queryClient, trashedMonthKey)).toBeUndefined();
    expect(state(queryClient, trashedUtcMonthKey)).toBeUndefined();
    expect(queryClient.getQueryData(keptMonthKey)).toHaveLength(1);
    expect(state(queryClient, keptMonthKey)?.isInvalidated).toBe(false);
  });

  it("removes the journal's cached notes, and only its own", async () => {
    const queryClient = seededClient();

    await trash(queryClient);

    expect(state(queryClient, trashedNoteKey)).toBeUndefined();
    expect(queryClient.getQueryData(keptNoteKey)).toMatchObject({
      id: "note-2",
    });
  });

  it("invalidates both journal lists and stats", async () => {
    const queryClient = seededClient();
    const live = watch(queryClient, liveKey);
    const trashed = watch(queryClient, trashKey);
    const totals = watch(queryClient, totalsKey);

    await trash(queryClient);

    expect(live.fetches()).toBe(1);
    expect(trashed.fetches()).toBe(1);
    expect(totals.fetches()).toBe(1);
  });

  it("drops the journal's notes from cached search results and marks search stale without refetching", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);

    await trash(queryClient);

    expect(
      queryClient.getQueryData(searchKey)?.map((hit) => hit.id),
    ).toEqual(["note-2"]);
    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
  });
});

describe("removeFromTrash cache effects", () => {
  const restore = (queryClient: QueryClient) =>
    run(
      queryClient,
      orpc.journalRouter.removeFromTrash.mutationOptions(),
      { id: TRASHED },
      { id: TRASHED },
    );

  it("invalidates both journal lists and stats", async () => {
    const queryClient = seededClient();
    const live = watch(queryClient, liveKey);
    const trashed = watch(queryClient, trashKey);
    const totals = watch(queryClient, totalsKey);

    await restore(queryClient);

    expect(live.fetches()).toBe(1);
    expect(trashed.fetches()).toBe(1);
    expect(totals.fetches()).toBe(1);
  });

  it("marks search stale without refetching", async () => {
    const queryClient = seededClient();
    const search = watch(queryClient, searchKey);

    await restore(queryClient);

    expect(state(queryClient, searchKey)?.isInvalidated).toBe(true);
    expect(search.fetches()).toBe(0);
  });
});

describe("deletePermanently cache effects", () => {
  it("invalidates the trashed list and leaves the live list, stats and search alone", async () => {
    const queryClient = seededClient();
    const trashed = watch(queryClient, trashKey);
    const live = watch(queryClient, liveKey);

    await run(
      queryClient,
      orpc.journalRouter.deletePermanently.mutationOptions(),
      { id: TRASHED },
      { id: TRASHED },
    );

    expect(trashed.fetches()).toBe(1);
    expect(live.fetches()).toBe(0);
    expect(state(queryClient, liveKey)?.isInvalidated).toBe(false);
    expect(state(queryClient, totalsKey)?.isInvalidated).toBe(false);
    expect(state(queryClient, searchKey)?.isInvalidated).toBe(false);
  });
});

describe("createJournal cache effects", () => {
  it("invalidates the live list and leaves the trashed list alone", async () => {
    const queryClient = seededClient();
    const live = watch(queryClient, liveKey);
    const trashed = watch(queryClient, trashKey);

    await run(
      queryClient,
      orpc.journalRouter.createJournal.mutationOptions(),
      { title: "Work" },
      "journal-3",
    );

    expect(live.fetches()).toBe(1);
    expect(trashed.fetches()).toBe(0);
    expect(state(queryClient, trashKey)?.isInvalidated).toBe(false);
  });
});
