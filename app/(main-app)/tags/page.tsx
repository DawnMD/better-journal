import { auth } from "@clerk/nextjs/server";
import { HydrateClient } from "@/components/hydration";
import { PageContainer } from "@/components/shell/page-container";
import { TagManager } from "@/components/tags/tag-manager";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";

export default async function TagsPage() {
  await auth.protect();

  const queryClient = getQueryClient();

  // Not awaited: the manager suspends on this same key, so the streamed
  // boundary resolves as soon as the query does. Same shape as the trash page.
  queryClient.prefetchQuery(orpc.tagRouter.getAllTags.queryOptions());

  return (
    <HydrateClient client={queryClient}>
      <PageContainer>
        <TagManager />
      </PageContainer>
    </HydrateClient>
  );
}
