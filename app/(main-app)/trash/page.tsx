import { HydrateClient } from "@/components/hydration";
import { TrashedJournalTable } from "@/components/trash-journal-table";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";

export default function TrashPage() {
  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  return (
    <HydrateClient client={queryClient}>
      <TrashedJournalTable />
    </HydrateClient>
  );
}
