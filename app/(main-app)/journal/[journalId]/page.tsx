import { HydrateClient } from "@/components/hydration";
import { JournalData } from "@/components/journal-data";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { serverTimeZone } from "@/lib/timezone.server";
import { format } from "date-fns";
import { notFound } from "next/navigation";

export default async function JournalIdPage({
  params,
  searchParams,
}: PageProps<"/journal/[journalId]">) {
  const { journalId } = await params;
  const { date } = (await searchParams) as {
    date: string;
  };

  const selectedDate = date ?? format(new Date(), "yyyy-MM-dd");
  const month = selectedDate.slice(0, 7);

  // Read from the tz cookie so these prefetches build the same query keys the
  // client will. See lib/timezone.server.ts for why this is best-effort.
  const timeZone = await serverTimeZone();

  const queryClient = getQueryClient();

  // Started before the existence check below so all three round trips overlap.
  // prefetchQuery swallows its own failures, so if the journal turns out not to
  // resolve these just go nowhere — the 404 is decided by the awaited query.
  Promise.all([
    queryClient.prefetchQuery(
      orpc.notesRouter.getAllNotesByIdAndDate.queryOptions({
        input: {
          journalId,
          date: selectedDate,
          timeZone,
        },
      }),
    ),
    queryClient.prefetchQuery(
      orpc.notesRouter.getNoteCountsByMonth.queryOptions({
        input: { journalId, month, timeZone },
      }),
    ),
  ]);

  // Awaited, unlike the two above: an id that does not resolve has to become a
  // real 404 — status code and all — here on the server. Prefetching it instead
  // would hand the browser a page that only discovers the journal is gone once
  // the client re-runs the query, by which point the best it can do is an error
  // boundary. The result is still cached, so the client query below is free.
  const journal = await queryClient.fetchQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id: journalId },
    }),
  );

  if (!journal) notFound();

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} />
    </HydrateClient>
  );
}
