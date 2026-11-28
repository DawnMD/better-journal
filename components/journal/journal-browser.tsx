"use client";

import { TagFilterBar } from "@/components/calendar/tag-filter-bar";
import { EmptyState } from "@/components/empty-state";
import { MonthCalendar } from "@/components/journal/month-calendar";
import { dayElementId, NoteList } from "@/components/journal/note-list";
import { useReaderToday, useReaderZone } from "@/components/reader-zone";
import { Button } from "@/components/ui/button";
import { resolveDayKey } from "@/lib/calendar";
import { orpc } from "@/lib/orpc.query";
import { listNotesOptions } from "@/lib/query/list-notes";
import { ownedTagIds, resolveTagIds, serializeTagIds } from "@/lib/tags";
import { cn } from "@/lib/utils";
import {
  useMutation,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CalendarDaysIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";

/**
 * The journal page: a note list to browse back through, beside a month
 * calendar that maps it.
 *
 * The URL holds what is shareable — `?date=` (where the list opens) and
 * `?tags=` (what it shows). Which month the calendar shows is not in it: that
 * follows the list's scroll, and writing it back on every scroll would make
 * the URL churn under the reader.
 */
export const JournalBrowser = ({ journalId }: { journalId: string }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { zone: timeZone } = useReaderZone();
  const today = useReaderToday();

  // Undefined, not today, when absent or malformed: an unanchored list opens
  // on the newest note, which may well be later than today in another zone.
  const dateParam = resolveDayKey(searchParams.get("date"), "") || undefined;

  // Prefetched by the page, so this does not suspend on a normal load. The
  // filter needs the reader's tags before the list can be asked for at all.
  const { data: allTags } = useSuspenseQuery(
    orpc.tagRouter.getAllTags.queryOptions(),
  );
  const tagIds = ownedTagIds(resolveTagIds(searchParams.get("tags")), allTags);

  // Where the list is anchored: `?date=` on arrival, then whichever day the
  // calendar last jumped to that was not already loaded. Held in state rather
  // than read from the URL on every render, so jumping to a day already in the
  // list scrolls to it instead of throwing the list away and refetching it.
  const [listAnchor, setListAnchor] = useState(dateParam);

  const list = useSuspenseInfiniteQuery(
    listNotesOptions({ journalId, timeZone, anchor: listAnchor, tagIds }),
  );
  const notes = list.data.pages.flatMap((page) => page.notes);

  // A day the calendar jumped to whose rows are still loading.
  const scrollTarget = useRef<string | null>(null);

  useEffect(() => {
    const day = scrollTarget.current;
    const row = day && document.getElementById(dayElementId(day));
    if (!row) return;

    scrollTarget.current = null;
    row.scrollIntoView({ block: "start" });
  }, [notes]);

  // The calendar's month: the anchor's at first, then whatever the list
  // scrolls to or the arrows page to.
  const [calendarMonth, setCalendarMonth] = useState(dateParam ?? today);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const navigate = (next: { date?: string; tags?: string[] }) => {
    const params = new URLSearchParams(searchParams);

    if (next.date) params.set("date", next.date);
    if (next.tags) {
      if (next.tags.length === 0) params.delete("tags");
      else params.set("tags", serializeTagIds(next.tags));
    }

    // `replace`, not `push`: browsing is not a series of places to go Back
    // to, and Back should leave the journal rather than undo a click.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { mutate: createNote, isPending: isCreating } = useMutation(
    orpc.notesRouter.createNote.mutationOptions({
      onSuccess: ({ id: noteId }) => {
        router.push(`/journal/${journalId}/${noteId}`);
      },
    }),
  );

  const selectDay = (day: string) => {
    setCalendarMonth(day);
    navigate({ date: day });

    const row = document.getElementById(dayElementId(day));
    if (row) {
      row.scrollIntoView({ block: "start" });
      return;
    }

    // Not loaded yet: re-anchor the list there. In a transition, so the list
    // in view stays up while the new one loads instead of suspending the page
    // back to its skeleton.
    scrollTarget.current = day;
    startTransition(() => setListAnchor(day));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TagFilterBar
          selectedTagIds={tagIds}
          onChange={(next) => navigate({ tags: next })}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={calendarOpen}
            aria-controls="journal-calendar"
            onClick={() => setCalendarOpen((open) => !open)}
          >
            <CalendarDaysIcon />
            Calendar
          </Button>
          <Button
            size="sm"
            disabled={isCreating}
            onClick={() => createNote({ journalId, timeZone })}
          >
            <PlusIcon />
            New note
          </Button>
        </div>
      </div>

      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* First in the markup, so on a phone it sits above the list — folded
            away until asked for. Beside the list from `lg` up, and sticky, so
            it stays on screen as the list scrolls under it. */}
        <aside
          id="journal-calendar"
          className={cn(
            "self-start rounded-lg border border-border/60 p-3 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:block",
            calendarOpen ? "block" : "hidden",
          )}
        >
          <MonthCalendar
            journalId={journalId}
            timeZone={timeZone}
            month={calendarMonth}
            tagIds={tagIds}
            selectedDay={dateParam}
            todayKey={today}
            onMonthChange={setCalendarMonth}
            onSelectDay={selectDay}
          />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {notes.length === 0 ? (
            <EmptyState
              size="inline"
              eyebrow={tagIds.length > 0 ? "No matches" : "Empty"}
              title={
                tagIds.length > 0
                  ? "No notes carry all of those tags."
                  : "Nothing written yet."
              }
            />
          ) : (
            <NoteList
              journalId={journalId}
              notes={notes}
              hasOlder={list.hasNextPage}
              hasNewer={list.hasPreviousPage}
              isFetchingOlder={list.isFetchingNextPage}
              isFetchingNewer={list.isFetchingPreviousPage}
              onLoadOlder={() => list.fetchNextPage()}
              onLoadNewer={() => list.fetchPreviousPage()}
              onTopDayChange={setCalendarMonth}
            />
          )}
        </div>
      </div>
    </div>
  );
};
