import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Line widths for the placeholder prose, in percent.
 *
 * Written out rather than randomised so the shape is the same on the server and
 * on the client — and so two loads in a row do not shuffle the page. The short
 * entries end paragraphs; a column of identical full-width bars reads as a table,
 * not as writing.
 */
const LINES = [100, 96, 88, 100, 62, 100, 92, 100, 74];

/**
 * The editor's loading state.
 *
 * The spinner this replaces was centred inside a `container`, which sets a
 * max-width but no auto margins, in a `main` with no height to fill — so on a
 * desktop window it sat left of centre and drifted with the viewport. Nothing
 * here needs centring: the dateline, title and prose sit in the same 68ch
 * measure the note itself uses, at the same sizes, so the entry fades in where
 * its placeholder already was.
 */
export default function Loading() {
  return (
    <PageContainer width="prose">
      <div className="w-full" role="status" aria-busy="true">
        <span className="sr-only">Loading entry</span>

        {/* The dateline: date · word count. */}
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>

        {/* The title, at the height NoteTitle's display serif renders to. */}
        <Skeleton className="mb-3 h-[39px] w-3/4 sm:h-[44px]" />

        {/* NoteTags' chip row, including the "add" control at the end. */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-md" />
        </div>

        {/* The formatting toolbar. Same row height as the real one, which is a
            row of `h-9` ToolbarButtons inside a `py-1` strip. */}
        <div className="flex items-center gap-1 py-1">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-9 w-14 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>

        {/* 18px/1.75 is the writing surface's measure — the bars are spaced to
            match, so the first paragraph lands on the line it was drawn on. */}
        <div className="space-y-[14px] pt-4">
          {LINES.map((width, index) => (
            <Skeleton
              key={index}
              className="h-[18px]"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
