"use client";

import { NoteEvent, type CalendarNote } from "@/components/calendar/note-event";
import type { RangeKey } from "@/components/note-row-actions";
import { DAY_KEY, formatMinutes, packEvents, SLOT_MINUTES } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useEffect, useRef } from "react";

/** Pixels per hour. The one number the whole layout is derived from. */
const HOUR_PX = 56;
const DAY_PX = HOUR_PX * 24;
const SLOT_PX = (SLOT_MINUTES / 60) * HOUR_PX;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Where the scroll starts when nothing on the day suggests otherwise. */
const DEFAULT_SCROLL_HOUR = 7;

/**
 * Below this a week's columns get narrower than a legible chip, so the grid
 * scrolls sideways rather than shrinking further — the same trade the activity
 * heatmap makes. A single-column day view never needs it.
 */
const MIN_WEEK_WIDTH = 640;

/**
 * The week and day views.
 *
 * One component for both: a day view is a week view with a single column, and
 * splitting them would mean maintaining two copies of the time axis, the now
 * indicator and the overlap packing.
 *
 * Both axes scroll on one container, with the date header sticky inside it.
 * Two containers — a fixed header over a scrolling body — would need their
 * horizontal offsets kept in sync by hand, and the failure mode when they drift
 * is a note sitting under the wrong date.
 */
export const TimeGridView = ({
  days,
  notesByDay,
  selectedKey,
  todayKey,
  nowMinutes,
  journalId,
  range,
  onSelectDay,
}: {
  days: Date[];
  notesByDay: Map<string, CalendarNote[]>;
  selectedKey: string;
  todayKey: string;
  /** Minutes past local midnight, or null before hydration decides. */
  nowMinutes: number | null;
  journalId: string;
  range: RangeKey;
  onSelectDay: (day: Date) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // The columns are 1344px tall and almost every note sits in the middle of
  // them, so opening at 00:00 would reliably show an empty grid. Scroll to the
  // earliest note on screen instead, falling back to a plausible morning.
  const firstMinutes = days.reduce<number | null>((earliest, day) => {
    const first = notesByDay.get(format(day, DAY_KEY))?.[0]?.minutes;
    if (first === undefined) return earliest;
    return earliest === null ? first : Math.min(earliest, first);
  }, null);

  const scrollTo = Math.max(
    0,
    ((firstMinutes ?? DEFAULT_SCROLL_HOUR * 60) / 60) * HOUR_PX - HOUR_PX,
  );

  useEffect(() => {
    // Not smooth: this is the initial position, not a movement, and animating
    // it makes the view look like it drifted while you were reading it.
    scrollRef.current?.scrollTo({ top: scrollTo });
  }, [scrollTo]);

  const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div
      ref={scrollRef}
      className="max-h-[65vh] overflow-auto rounded-lg border border-border/60"
    >
      <div style={{ minWidth: days.length > 1 ? MIN_WEEK_WIDTH : undefined }}>
        {/* Sticky so the dates stay put while the time axis scrolls under them.
            Opaque, not translucent — the notes would otherwise show through. */}
        <div
          className="sticky top-0 z-20 grid border-b border-border/60 bg-background"
          style={{ gridTemplateColumns: columns }}
        >
          <div className="border-r border-border/60" />
          {days.map((day) => {
            const key = format(day, DAY_KEY);
            const isToday = key === todayKey;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(day)}
                className={cn(
                  "flex flex-col items-center gap-0.5 border-l border-border/60 px-1 py-1.5 transition-colors",
                  "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  key === selectedKey && "bg-accent/70",
                )}
              >
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
                    // Same clay ring the month grid marks today with.
                    isToday && "text-brand ring-1 ring-brand",
                  )}
                >
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: columns }}>
          {/* Hour gutter. Labels sit *on* their line rather than inside the
              band below it, so a note at 09:05 reads as just after "9 AM". */}
          <div
            className="relative border-r border-border/60"
            style={{ height: DAY_PX }}
          >
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground"
                style={{ top: hour * HOUR_PX }}
              >
                {/* Midnight's label would be clipped by the grid's own top edge,
                    and the date header directly above it already says the day. */}
                {hour === 0 ? "" : formatMinutes(hour * 60).replace(":00", "")}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const key = format(day, DAY_KEY);
            const placed = packEvents(notesByDay.get(key) ?? []);
            const showNow = key === todayKey && nowMinutes !== null;

            return (
              <div
                key={key}
                className="relative border-l border-border/60"
                style={{
                  height: DAY_PX,
                  // Drawn as a gradient rather than 24 elements per column: the
                  // rules are decoration, and a week view would otherwise add
                  // 168 nodes that exist only to be a 1px line.
                  //
                  // Mixed down rather than using --color-border straight: 24 of
                  // these per column is the densest ruling anywhere in the app,
                  // and at full border weight the grid competes with the entries
                  // sitting on it.
                  backgroundImage: `repeating-linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 55%, transparent) 0, color-mix(in oklab, var(--color-border) 55%, transparent) 1px, transparent 1px, transparent ${HOUR_PX}px)`,
                }}
              >
                {placed.map(({ event, column, columns: lanes }) => (
                  <div
                    key={event.id}
                    className="absolute px-0.5"
                    style={{
                      top: (event.minutes / 60) * HOUR_PX,
                      height: SLOT_PX,
                      left: `${(column / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                    }}
                  >
                    <NoteEvent
                      note={event}
                      journalId={journalId}
                      range={range}
                      // The time is already given by the vertical position, and
                      // a narrow lane needs every pixel for the title.
                      showTime={lanes === 1}
                      // Same threshold, same reason: a full-width lane has room
                      // to name a tag, a shared one does not.
                      tagStyle={lanes === 1 ? "chips" : "dots"}
                      className="h-full"
                    />
                  </div>
                ))}

                {showNow && (
                  <div
                    aria-hidden
                    // Clay, not destructive-red. "Now" is a position on a grid,
                    // not a failure, and it was borrowing the one colour the app
                    // reserves for things going wrong.
                    className="pointer-events-none absolute inset-x-0 z-10 border-t border-brand"
                    style={{ top: (nowMinutes / 60) * HOUR_PX }}
                  >
                    <span className="absolute -top-1 -left-1 size-2 rounded-full bg-brand" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
