import { ReaderZoneProvider } from "@/components/reader-zone";
import type { TrashJournals } from "@/components/trash-columns";
import { TrashedJournalTable } from "@/components/trash-journal-table";
import { orpc } from "@/lib/orpc.query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * The trash table on the server render.
 *
 * The trash page lists the user's trashed journals with how many notes each
 * holds, so they can pick one to restore or purge. The table is built on
 * @tanstack/react-table, so this pins what the reader sees across upgrades of
 * that library.
 */

function trashedJournal(
  overrides: Partial<TrashJournals> & Pick<TrashJournals, "id" | "title">,
): TrashJournals {
  return {
    description: null,
    userId: "user_1",
    trash: true,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    updatedAt: new Date("2026-11-02T10:00:00Z"),
    notes: [],
    ...overrides,
  };
}

/** Server-renders the trash table over a cache holding `journals`. */
function renderTrash(journals: TrashJournals[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(
    orpc.journalRouter.getTrashedJournal.queryKey(),
    journals,
  );

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <ReaderZoneProvider initialZone="UTC">
        <TrashedJournalTable />
      </ReaderZoneProvider>
    </QueryClientProvider>,
  );
}

describe("trash journal table", () => {
  it("lists each trashed journal with how many notes it holds", () => {
    const html = renderTrash([
      trashedJournal({
        id: "j1",
        title: "Travel log",
        notes: [
          { id: "n1", title: "Lisbon", updatedAt: new Date("2026-11-02T10:00:00Z") },
          { id: "n2", title: "Porto", updatedAt: new Date("2026-11-03T10:00:00Z") },
        ],
      }),
      trashedJournal({ id: "j2", title: "Dream diary" }),
    ]);

    // Column headers.
    expect(html).toMatch(/<th[^>]*>Notes<\/th>/);
    expect(html).toMatch(/<th[^>]*>Title<\/th>/);

    // One row per journal, title and note count side by side, newest first as
    // the server ordered them.
    const rows = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? [];
    const bodyRows = rows.filter((row) => !row.includes("<th"));
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]).toMatch(/>2<\/span>.*Travel log/);
    expect(bodyRows[1]).toMatch(/>0<\/span>.*Dream diary/);

    // Collapsed by default: the notes inside a journal stay hidden.
    expect(html).not.toContain("Lisbon");
  });

  it("shows the empty state when nothing is in the trash", () => {
    const html = renderTrash([]);

    expect(html).toContain("Nothing in the trash");
  });
});
