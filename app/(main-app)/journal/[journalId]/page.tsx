import { HydrateClient } from "@/components/hydration";
import { JournalData } from "@/components/journal-data";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { serverTimeZone } from "@/lib/timezone.server";
import { format } from "date-fns";

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

  Promise.all([
    queryClient.prefetchQuery(
      orpc.journalRouter.getJournalById.queryOptions({
        input: { id: journalId },
      }),
    ),
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

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} />
    </HydrateClient>
  );
}
