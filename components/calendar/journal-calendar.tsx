"use client";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { MonthView } from "@/components/calendar/month-view";
import type { CalendarNote } from "@/components/calendar/note-event";
import { TimeGridView } from "@/components/calendar/time-grid-view";
import { useNowMinutes, useToday } from "@/components/calendar/use-today";
import {
  DAY_KEY,
  rangeKeys,
  resolveDayKey,
  resolveView,
  shiftAnchor,
  viewTitle,
  visibleDays,
  type CalendarView,
} from "@/lib/calendar";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

/** Written out per view — "no notes in this day" is not a sentence. */
const EMPTY_MESSAGE: Record<CalendarView, string> = {
  month: "Nothing written this month.",
  week: "Nothing written this week.",
  day: "Nothing written on this day.",
};

/**
 * The journal's calendar: month, week and day.
 *
 * All of the state that says *what you are looking at* — the selected day and
 * the view — lives in the URL and is derived on every render, never seeded into
 * `useState`. That is what makes browser back/forward, which changes the query
 * string without remounting, move the calendar; it also makes a day view
 * linkable, which the old badge-plus-panel arrangement never was.
 */
export const JournalCalendar = ({
  journalId,
  serverToday,
}: {
  journalId: string;
  /** Today in the `tz`-cookie zone, so the first paint matches what hydrates. */
  serverToday: string;
}) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const timeZone = clientTimeZone();
  const today = useToday(serverToday);
  const nowMinutes = useNowMinutes();

  const view = resolveView(searchParams.get("view"));
  const selectedKey = resolveDayKey(searchParams.get("date"), today);
  const anchor = parseISO(selectedKey);

  // Recomputed rather than memoised: `anchor` is a fresh Date every render, so a
  // memo keyed on it would never hit anyway, and laying out 42 dates is cheaper
  // than the comparison would be. The oRPC query key is structural, so `range`
  // changing identity does not refetch.
  const days = visibleDays(anchor, view);
  const range = { ...rangeKeys(anchor, view), timeZone };

  const { data: notes } = useSuspenseQuery(
    orpc.notesRouter.getNotesInRange.queryOptions({
      input: { journalId, ...range },
    }),
  );

  // Bucketed by the `day` the *server* assigned, not by anything re-derived
  // here. The whole class of bug this page used to have was two sides counting
  // the same note into two different days.
  const notesByDay = useMemo(() => {
    const byDay = new Map<string, CalendarNote[]>();

    for (const note of notes) {
      const existing = byDay.get(note.day);
      if (existing) existing.push(note);
      else byDay.set(note.day, [note]);
    }

    return byDay;
  }, [notes]);

  /** Writes the new coordinates to the URL, which is what actually moves the view. */
  const navigate = (next: { date?: Date; view?: CalendarView }) => {
    const params = new URLSearchParams(searchParams);

    if (next.date) params.set("date", format(next.date, DAY_KEY));
    if (next.view) params.set("view", next.view);

    // `replace`, not `push`: paging a calendar is browsing, and stacking one
    // history entry per month would make Back mean "undo my last click" instead
    // of "go back to where I came from".
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { mutate: createNote, isPending: isCreating } = useMutation(
    orpc.notesRouter.createNote.mutationOptions({
      onSuccess: ({ id: noteId }) => {
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getNotesInRange.queryKey({
            input: { journalId, ...range },
          }),
        });
        router.push(`/journal/${journalId}/${noteId}`);
      },
    }),
  );

  const isOnToday = selectedKey === today;

  return (
    <div>
      <CalendarToolbar
        title={viewTitle(anchor, view)}
        view={view}
        isOnToday={isOnToday}
        // `createNote` stamps `createdAt` server-side, so a note can only ever
        // land on today. The button follows that rather than pretending
        // otherwise and filing the entry somewhere the user did not expect.
        canCreate={isOnToday}
        isCreating={isCreating}
        onShift={(direction) =>
          navigate({ date: shiftAnchor(anchor, view, direction) })
        }
        onToday={() => navigate({ date: parseISO(today) })}
        onViewChange={(next) => navigate({ view: next })}
        onCreate={() => createNote({ journalId })}
      />

      {view === "month" ? (
        <MonthView
          days={days}
          anchorMonth={anchor}
          notesByDay={notesByDay}
          selectedKey={selectedKey}
          todayKey={today}
          journalId={journalId}
          range={range}
          onSelectDay={(day) => navigate({ date: day })}
          onOpenDay={(day) => navigate({ date: day, view: "day" })}
        />
      ) : (
        <TimeGridView
          days={days}
          notesByDay={notesByDay}
          selectedKey={selectedKey}
          todayKey={today}
          nowMinutes={nowMinutes}
          journalId={journalId}
          range={range}
          onSelectDay={(day) => navigate({ date: day })}
        />
      )}

      {notes.length === 0 && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          {EMPTY_MESSAGE[view]}
        </p>
      )}
    </div>
  );
};
