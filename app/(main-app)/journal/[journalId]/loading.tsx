import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/** The compact calendar's six weeks. */
const CELLS = 42;
const ROWS = 6;

/**
 * The journal page's loading state.
 *
 * The real chrome, not a spinner: the header, the filter row, the note list and
 * — from `lg` up — the side calendar, each the size it will be once the notes
 * land, so nothing on the page moves when they do. Mirrors JournalBrowser.
 */
export default function Loading() {
  return (
    <PageContainer width="wide">
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading notes</span>

        {/* Matches JournalData's header: title, optional description, export. */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-md" />
        </header>

        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="ml-auto h-7 w-24 rounded-md" />
        </div>

        <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <Skeleton className="mb-3 h-3 w-24" />
            {Array.from({ length: ROWS }).map((_, index) => (
              <div key={index} className="border-b border-border/60 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="mt-2 h-4 w-4/5" />
              </div>
            ))}
          </div>

          <div className="hidden self-start rounded-lg border border-border/60 p-3 lg:block">
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: CELLS }).map((_, index) => (
                <Skeleton key={index} className="mx-auto size-8 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
