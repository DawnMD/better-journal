"use client";

import { MonthCell } from "@/components/calendar/month-cell";
import type { CalendarNote } from "@/components/calendar/note-event";
import type { RangeKey } from "@/components/note-row-actions";
import { DAY_KEY } from "@/lib/calendar";
import { format, isSameMonth } from "date-fns";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The month grid.
 *
 * Six fixed weeks of cells, each showing its own notes as dots rather than as a
 * count you have to click to resolve. The badge-and-side-panel arrangement this
 * replaced made you click a day to learn whether it was worth clicking; here the
 * shape of the month is on the page and the titles are one hover away.
 */
export const MonthView = ({
  days,
  anchorMonth,
  notesByDay,
  selectedKey,
  todayKey,
  journalId,
  range,
  onSelectDay,
  onOpenDay,
}: {
  days: Date[];
  /** Any date in the month being displayed; decides which cells are "outside". */
  anchorMonth: Date;
  notesByDay: Map<string, CalendarNote[]>;
  selectedKey: string;
  todayKey: string;
  journalId: string;
  range: RangeKey;
  onSelectDay: (day: Date) => void;
  onOpenDay: (day: Date) => void;
}) => {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      {/* No fill behind the weekday row — the hairline under it is enough to
          separate a header from a grid, and a tinted strip is a band of colour
          across the widest element on the page for no information. */}
      <div className="grid grid-cols-7 border-b border-border/60">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-2 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
          >
            {/* The three-letter name is the accessible one; narrow screens get a
                single letter, so the full name stays available to a reader. */}
            <span className="sr-only">{weekday}</span>
            <span aria-hidden className="sm:hidden">
              {weekday[0]}
            </span>
            <span aria-hidden className="hidden sm:inline">
              {weekday}
            </span>
          </div>
        ))}
      </div>

      {/* One negative-margin trick avoided: cells draw their own top and left
          borders and the container clips the outer ones, so there is no double
          line between neighbours. */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, DAY_KEY);

          return (
            <MonthCell
              key={key}
              day={day}
              notes={notesByDay.get(key) ?? []}
              outside={!isSameMonth(day, anchorMonth)}
              isToday={key === todayKey}
              isSelected={key === selectedKey}
              journalId={journalId}
              range={range}
              onSelectDay={onSelectDay}
              onOpenDay={onOpenDay}
            />
          );
        })}
      </div>
    </div>
  );
};
