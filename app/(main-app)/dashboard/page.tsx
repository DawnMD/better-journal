import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { WordsChart } from "@/components/dashboard/words-chart";
import { HydrateClient } from "@/components/hydration";
import { ReaderZoneProvider } from "@/components/reader-zone";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { readerCalendarFromCookie } from "@/server/lib/reader-calendar";
import { Suspense } from "react";

export default async function DashboardPage() {
  const calendar = await readerCalendarFromCookie();
  const timeZone = calendar.zone;
  // The reader's year, not the server's: around New Year they differ, and the
  // heatmap opens on the reader's.
  const year = Number(calendar.today().slice(0, 4));
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
        input: { year, timeZone },
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
      {/* Seeded with the zone the prefetch above was keyed on, so the
          dashboard's first paint reads the prefetched data. */}
      <ReaderZoneProvider initialZone={timeZone}>
        <PageContainer>
          <div className="flex flex-col gap-8">
            <div className="space-y-1">
              {/* "Dashboard" is what the template called it. This page is a year of
                  someone's writing looked at from above, and the subtitle already
                  says what it measures — so the heading can name the thing rather
                  than the widget it is made of. */}
              <h1 className="font-serif text-3xl tracking-tight">
                Your year so far
              </h1>
              <p className="text-sm text-muted-foreground">
                How your writing habit is going.
              </p>
            </div>

            <Suspense fallback={<TilesSkeleton />}>
              <StatTiles />
            </Suspense>

            <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
              <ActivityHeatmap />
            </Suspense>

            <Suspense fallback={<Skeleton className="h-80 w-full rounded-lg" />}>
              <WordsChart />
            </Suspense>
          </div>
        </PageContainer>
      </ReaderZoneProvider>
    </HydrateClient>
  );
}

function TilesSkeleton() {
  return <Skeleton className="h-28 w-full rounded-lg" />;
}
