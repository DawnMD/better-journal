"use client";

import { ExportJournalButton } from "@/components/export-journal-button";
import { JournalBrowser } from "@/components/journal/journal-browser";
import { isNotFoundError } from "@/lib/orpc.errors";
import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";

export const JournalData = ({ id }: { id: string }) => {
  const { data: journal, error } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id },
    }),
  );

  // The page already 404s on the server for a journal that does not resolve, so
  // this covers the narrow window the server cannot: a journal trashed from
  // another tab while this one is open, which answers NOT_FOUND on the next
  // refetch. A suspense query only throws when it has no data yet, so a refetch
  // that fails behind cached data has to be rethrown here; the journal's error
  // boundary turns it into the same not-found view the server page shows.
  if (isNotFoundError(error)) throw error;

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl tracking-tight">
            {journal.title}
          </h1>
          {journal.description && (
            <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
              {journal.description}
            </p>
          )}
        </div>
        <ExportJournalButton journalId={id} />
      </header>

      <JournalBrowser journalId={id} />
    </div>
  );
};
