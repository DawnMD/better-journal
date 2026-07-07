import { HydrateClient } from "@/components/hydration";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { TrashedJournals } from "./trash-journals";

export default function TrashPage() {
  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  return (
    <HydrateClient client={queryClient}>
      <TrashedJournals />
    </HydrateClient>
  );
}
