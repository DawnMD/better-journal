import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { WordsChart } from "@/components/dashboard/words-chart";
import { ReaderZoneProvider } from "@/components/reader-zone";
import { orpc } from "@/lib/orpc.query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard on the server render.
 *
 * The dashboard page prefetches every stats query in the reader zone from the
 * `tz` cookie. The components must ask for the same queries — same zone, so the
 * same query keys — or the first paint misses the prefetched data, suspends,
 * and the browser fetches it all again in a different zone. So each component
 * reads the zone from the reader-zone provider, never from the runtime.
 */

const SEED = "Asia/Kolkata";

// 01:30 IST on 2027-01-01, which is still 2026-12-31 in New York and in UTC —
// so a component that took its zone or its year from the runtime cannot agree
// with the prefetch by coincidence.
const NEW_YEAR_IN_IST = new Date("2026-12-31T20:00:00Z");

const LOADING = "loading-fallback";

/** Server-renders `ui` over a cache holding only what the page prefetched. */
function renderPrefetched(ui: React.ReactNode, prefill: (qc: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  prefill(queryClient);

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <ReaderZoneProvider initialZone={SEED}>
        <Suspense fallback={<p>{LOADING}</p>}>{ui}</Suspense>
      </ReaderZoneProvider>
    </QueryClientProvider>,
  );
}

describe("dashboard components on the server render", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // Neither the seed nor UTC, so a zone leaked from the runtime shows up.
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ now: NEW_YEAR_IN_IST, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("stat tiles read the totals and streak prefetched in the reader zone", () => {
    const html = renderPrefetched(<StatTiles />, (qc) => {
      qc.setQueryData(
        orpc.statsRouter.getTotals.queryKey({ input: { timeZone: SEED } }),
        { journals: 2, notes: 7, words: 40, daysActive: 5, firstEntry: null },
      );
      qc.setQueryData(
        orpc.statsRouter.getStreak.queryKey({ input: { timeZone: SEED } }),
        { current: 3, longest: 9 },
      );
    });

    expect(html).not.toContain(LOADING);
    expect(html).toContain("Longest 9 days");
    expect(html).toContain("Across 2 journals");
  });

  it("the heatmap opens on the reader's year with the activity prefetched for it", () => {
    // New Year has already come in IST and not yet in New York: the page
    // prefetches 2027, so the heatmap must ask for 2027 too.
    const html = renderPrefetched(<ActivityHeatmap />, (qc) => {
      qc.setQueryData(
        orpc.statsRouter.getActivity.queryKey({
          input: { year: 2027, timeZone: SEED },
        }),
        { year: 2027, byDay: { "2027-01-01": { count: 4, words: 10 } } },
      );
    });

    expect(html).not.toContain(LOADING);
    expect(html).toContain("4 entries across 1 day in 2027");
  });

  it("the words chart reads the word counts prefetched in the reader zone", () => {
    const html = renderPrefetched(<WordsChart />, (qc) => {
      qc.setQueryData(
        orpc.statsRouter.getWordCounts.queryKey({
          input: { range: "90d", timeZone: SEED },
        }),
        {
          range: "90d",
          bucket: "day",
          points: [{ bucket: "2027-01-01", words: 321, notes: 2 }],
        },
      );
    });

    expect(html).not.toContain(LOADING);
    expect(html).toContain("321");
  });
});
