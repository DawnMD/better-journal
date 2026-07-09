import { HydrateClient } from "@/components/hydration";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { JournalData } from "./journal-data";
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

  queryClient.prefetchQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id: journalId, date: selectedDate },
    }),
  );

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} />
    </HydrateClient>
  );
}
