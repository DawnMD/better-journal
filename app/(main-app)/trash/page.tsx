import { auth } from "@clerk/nextjs/server";
import { HydrateClient } from "@/components/hydration";
import { ReaderZoneProvider } from "@/components/reader-zone";
import { PageContainer } from "@/components/shell/page-container";
import { TrashedJournalTable } from "@/components/trash-journal-table";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { readerCalendarFromCookie } from "@/server/lib/reader-calendar";

export default async function TrashPage() {
  await auth.protect();

  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  // The table dates every trashed note, so its first paint needs the reader
  // zone. Best-effort from the `tz` cookie, and only until the browser answers.
  const { zone } = await readerCalendarFromCookie();

  return (
    <HydrateClient client={queryClient}>
      <ReaderZoneProvider initialZone={zone}>
        <PageContainer>
          <TrashedJournalTable />
        </PageContainer>
      </ReaderZoneProvider>
    </HydrateClient>
  );
}
