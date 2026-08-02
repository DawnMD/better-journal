import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/** Six weeks of cells, the fixed height `visibleDays` always returns for a month. */
const CELLS = 42;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The calendar's loading state.
 *
 * A grid, not a spinner. The page it stands in for is a wide `PageContainer`, so
 * a centred spinner had nothing to centre against — `main` is `flex-1` with no
 * height of its own, and the old `container` class sets a max-width without the
 * auto margins to go with it, which is why the mark sat left of centre on a
 * desktop window and moved as the viewport changed.
 *
 * Laying out the real chrome instead fixes that by not needing to centre
 * anything: the toolbar row, the weekday header and the six-week grid are all
 * the size they will be once the notes land, so nothing on the page moves when
 * they do.
 */
export default function Loading() {
  return (
    <PageContainer width="wide">
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading calendar</span>

        {/* Matches JournalData's header: title, optional description, export. */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-md" />
        </header>

        {/* The toolbar. Real borders on the two grouped controls, so the row
            keeps its outline rather than dissolving into loose blocks. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="ml-1 h-7 w-16 rounded-md" />
          </div>

          <div className="order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">
            <Skeleton className="h-6 w-44 max-w-full" />
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-border/70 p-0.5">
            <Skeleton className="h-6 w-14 rounded-sm" />
            <Skeleton className="h-6 w-12 rounded-sm" />
            <Skeleton className="h-6 w-10 rounded-sm" />
          </div>

          <Skeleton className="h-7 w-24 rounded-md" />
        </div>

        {/* The weekday names are real text, not bars: they are the same seven
            words on every load, and reading them costs nothing. */}
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="grid grid-cols-7 border-b border-border/60">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="px-2 py-2 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                <span aria-hidden className="sm:hidden">
                  {weekday[0]}
                </span>
                <span aria-hidden className="hidden sm:inline">
                  {weekday}
                </span>
              </div>
            ))}
          </div>

          {/* Same borders and same min-heights as MonthCell, so the grid does not
              resize under the pointer the moment the query resolves. */}
          <div className="grid grid-cols-7">
            {Array.from({ length: CELLS }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-20 flex-col border-t border-l border-border/60 p-1 sm:min-h-24 [&:nth-child(7n+1)]:border-l-0 [&:nth-child(-n+7)]:border-t-0"
              >
                <Skeleton className="size-6 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
