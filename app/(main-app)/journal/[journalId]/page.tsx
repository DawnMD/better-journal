import { HydrateClient } from "@/components/hydration";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { JournalData } from "./journal-data";

export default async function JournalIdPage({
  params,
}: PageProps<"/journal/[journalId]">) {
  const { journalId } = await params;

  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id: journalId },
    }),
  );

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} />
    </HydrateClient>
  );
}
