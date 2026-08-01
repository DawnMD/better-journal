"use client";

import { JournalCalendar } from "@/components/calendar/journal-calendar";
import { ExportJournalButton } from "@/components/export-journal-button";
import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";

export const JournalData = ({
  id,
  serverToday,
}: {
  id: string;
  /** Passed through to the calendar; see `useToday` for why the server supplies it. */
  serverToday: string;
}) => {
  const { data: journal } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id },
    }),
  );

  // The page already 404s on the server for a journal that does not resolve, so
  // this covers the narrow window the server cannot: a journal trashed from
  // another tab while this one is open, which comes back null on the next
  // refetch. Same destination either way — the (main-app) not-found boundary.
  if (!journal) notFound();

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {journal.title}
          </h1>
          {journal.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {journal.description}
            </p>
          )}
        </div>
        <ExportJournalButton journalId={id} />
      </header>

      <JournalCalendar journalId={id} serverToday={serverToday} />
    </div>
  );
};
