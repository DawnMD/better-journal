"use client";

import { NoteEvent, type CalendarNote } from "@/components/calendar/note-event";
import type { RangeKey } from "@/components/note-row-actions";
import { DAY_KEY } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { format, isSameMonth } from "date-fns";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How many notes a cell shows before it collapses into "+N more".
 *
 * A month cell has room for about this many at the grid's minimum height. Past
 * it the cell would either grow — making the six rows different heights, which
 * is the jumping the fixed grid exists to prevent — or clip silently, which is
 * worse than saying how much was hidden.
 */
const MAX_PER_CELL = 3;

/**
 * The month grid.
 *
 * Six fixed weeks of cells, each holding its own notes rather than a count. The
 * badge-and-side-panel arrangement this replaced made you click a day to learn
 * whether it was worth clicking; here the answer is already on the page.
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
          const notes = notesByDay.get(key) ?? [];
          const outside = !isSameMonth(day, anchorMonth);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;

          const hidden = Math.max(0, notes.length - MAX_PER_CELL);

          return (
            <div
              key={key}
              // Clicking the empty part of a cell selects it. Not a button — the
              // cell contains links and a menu, and a nested interactive element
              // inside a button is neither valid nor operable. That leaves this
              // click mouse-only, which is why it is an enhancement rather than
              // the only route: the day-number button below is focusable and
              // reaches the same day.
              onClick={() => onSelectDay(day)}
              className={cn(
                "min-h-28 border-t border-l border-border/60 p-1 text-left transition-colors",
                // The header already draws the grid's top edge, and the
                // container clips its left one.
                "[&:nth-child(7n+1)]:border-l-0 [&:nth-child(-n+7)]:border-t-0",
                // Days outside the month recede rather than getting a fill of
                // their own. A `bg-muted/30` block put a second colour into the
                // grid to encode something the dimmed numbers already say, and
                // on paper it read as a stain rather than as "not this month".
                outside ? "opacity-45" : "hover:bg-muted/40",
                isSelected && "bg-accent/70 hover:bg-accent/70",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDay(day);
                  }}
                  aria-label={`${format(day, "EEEE, MMMM d, yyyy")}${
                    notes.length === 0
                      ? ", no notes"
                      : `, ${notes.length} ${notes.length === 1 ? "note" : "notes"}`
                  }`}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
                    "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    outside && "text-muted-foreground",
                    // A clay ring, not a filled ink disc. Today is worth marking,
                    // but a solid black circle is the heaviest mark on the grid —
                    // heavier than any actual entry — which puts the emphasis on
                    // the date rather than on what was written.
                    isToday &&
                      "ring-1 ring-brand text-brand hover:bg-brand/10",
                  )}
                >
                  {format(day, "d")}
                </button>
                {notes.length > 0 && (
                  <span
                    aria-hidden
                    className="pr-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                  >
                    {notes.length}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                {notes.slice(0, MAX_PER_CELL).map((note) => (
                  <NoteEvent
                    key={note.id}
                    note={note}
                    journalId={journalId}
                    range={range}
                    // A month cell is a seventh of the page wide. The month view
                    // answers "what did I write", the time grid answers "when" —
                    // so the clock stays there, and the title gets the pixels.
                    showTime={false}
                    // Same width argument: a named chip would leave nothing for
                    // the title, so tags shrink to dots that carry their name in
                    // a title and an aria-label instead.
                    tagStyle="dots"
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDay(day);
                    }}
                    className="rounded-sm px-1 py-0.5 text-left font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
