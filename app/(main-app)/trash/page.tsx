import { HydrateClient } from "@/components/hydration";
import { PageContainer } from "@/components/shell/page-container";
import { TrashedJournalTable } from "@/components/trash-journal-table";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { serverTimeZone } from "@/lib/timezone.server";

export default async function TrashPage() {
  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  // The table dates every trashed note, so it needs a zone. Best-effort from the
  // `tz` cookie — see lib/timezone.server.ts — and only until the browser answers.
  const timeZone = await serverTimeZone();

  return (
    <HydrateClient client={queryClient}>
      <PageContainer>
        <TrashedJournalTable serverTimeZone={timeZone} />
      </PageContainer>
    </HydrateClient>
  );
}
