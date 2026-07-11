import { HydrateClient } from "@/components/hydration";
import { JournalData } from "@/components/journal-data";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
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
        },
      }),
    ),
  ]);

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} />
    </HydrateClient>
  );
}
