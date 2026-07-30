import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { WordsChart } from "@/components/dashboard/words-chart";
import { HydrateClient } from "@/components/hydration";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { serverTimeZone } from "@/lib/timezone.server";
import { Suspense } from "react";

export default async function DashboardPage() {
  const timeZone = await serverTimeZone();
  const queryClient = getQueryClient();

  Promise.all([
    queryClient.prefetchQuery(
      orpc.statsRouter.getTotals.queryOptions({ input: { timeZone } }),
    ),
    queryClient.prefetchQuery(
      orpc.statsRouter.getStreak.queryOptions({ input: { timeZone } }),
    ),
    queryClient.prefetchQuery(
      orpc.statsRouter.getActivity.queryOptions({
        input: { year: new Date().getFullYear(), timeZone },
      }),
    ),
    queryClient.prefetchQuery(
      orpc.statsRouter.getWordCounts.queryOptions({
        input: { range: "90d", timeZone },
      }),
    ),
  ]);

  return (
    <HydrateClient client={queryClient}>

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            How your writing habit is going.
          </p>
        </div>

        <Suspense fallback={<TilesSkeleton />}>
          <StatTiles />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ActivityHeatmap />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <WordsChart />
        </Suspense>
      </div>
    </HydrateClient>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}
