"use client";

import { Button } from "@/components/ui/button";
import {
  DAY_KEY,
  monthTitle,
  rangeKeys,
  shiftMonth,
  visibleDays,
} from "@/lib/calendar";
import { orpc } from "@/lib/orpc.query";
import { hasAllTags } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, isSameMonth, parseISO } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The journal page's side calendar: one month, a dot under each day that has
 * notes, and nothing else. It is a map of the list beside it, not a second way
 * to read notes — so a day with notes is a button that jumps the list there,
 * and an empty day is plain text, since there is nothing to jump to.
 *
 * The month is owned by the caller, because it follows the list's scroll as
 * well as the arrows here.
 */
export const MonthCalendar = ({
  journalId,
  timeZone,
  month,
  tagIds,
  selectedDay,
  todayKey,
  onMonthChange,
  onSelectDay,
}: {
  journalId: string;
  timeZone: string;
  /** Any `yyyy-MM-dd` in the month shown. */
  month: string;
  /** The active tag filter: only days with a matching note get a dot. */
  tagIds: readonly string[];
  selectedDay: string | undefined;
  todayKey: string;
  onMonthChange: (month: string) => void;
  onSelectDay: (day: string) => void;
}) => {
  const anchor = parseISO(month);
  const days = visibleDays(anchor);

  // Not a suspense query: the month changes as the list scrolls, and
  // suspending would blank the calendar on every month boundary. The previous
  // month's dots stay up until the next month's arrive.
  const { data: notes = [] } = useQuery({
    ...orpc.notesRouter.getNotesInRange.queryOptions({
      input: { journalId, ...rangeKeys(anchor), timeZone },
    }),
    placeholderData: keepPreviousData,
  });

  const tagKey = tagIds.join(",");
  const countByDay = useMemo(() => {
    const ids = tagKey ? tagKey.split(",") : [];
    const counts = new Map<string, number>();

    for (const note of notes) {
      if (ids.length > 0 && !hasAllTags(note, ids)) continue;
      counts.set(note.day, (counts.get(note.day) ?? 0) + 1);
    }

    return counts;
  }, [notes, tagKey]);

  const shift = (direction: 1 | -1) =>
    onMonthChange(format(shiftMonth(anchor, direction), DAY_KEY));

  return (
    <section aria-label="Calendar" className="select-none">
      <div className="mb-2 flex items-center gap-1">
        <h2
          className="min-w-0 flex-1 truncate font-serif text-base tracking-tight"
          aria-live="polite"
        >
          {monthTitle(anchor)}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => shift(-1)}
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => shift(1)}
          aria-label="Next month"
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="pb-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
          >
            <span className="sr-only">{weekday}</span>
            <span aria-hidden>{weekday[0]}</span>
          </div>
        ))}

        {days.map((date) => {
          const key = format(date, DAY_KEY);
          const count = countByDay.get(key) ?? 0;
          const outside = !isSameMonth(date, anchor);
          const label = format(date, "EEEE, MMMM d, yyyy");

          const face = (
            <>
              <span className="tabular-nums">{format(date, "d")}</span>
              <span
                aria-hidden
                className={cn(
                  "size-1 rounded-full",
                  count > 0 ? "bg-brand" : "bg-transparent",
                )}
              />
            </>
          );

          const cellClasses = cn(
            "mx-auto flex size-8 flex-col items-center justify-center gap-0.5 rounded-md font-mono text-[11px]",
            outside && "opacity-45",
            key === todayKey && "text-brand",
          );

          return count > 0 ? (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              aria-label={`${label}, ${count} ${count === 1 ? "note" : "notes"}`}
              aria-pressed={key === selectedDay}
              className={cn(
                cellClasses,
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                key === selectedDay && "bg-accent hover:bg-accent",
              )}
            >
              {face}
            </button>
          ) : (
            <span
              key={key}
              className={cn(cellClasses, "text-muted-foreground")}
            >
              <span className="sr-only">{label}, no notes</span>
              <span aria-hidden className="contents">
                {face}
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
};
