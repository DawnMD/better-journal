"use client";

import { NoteEvent, type CalendarNote } from "@/components/calendar/note-event";
import type { RangeKey } from "@/components/note-row-actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { tagDotClasses } from "@/lib/tag-color";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * How many dots a cell draws before the rest collapse into "+N".
 *
 * Ten wraps to two rows at the narrowest cell the grid allows, which is as much
 * as fits under the date without pushing the six week-rows to different
 * heights. Past it the count beside the date is the honest number anyway.
 */
const MAX_DOTS = 10;

/**
 * One day in the month grid.
 *
 * The cell shows *that* something was written, not *what* — a row of dots, one
 * per note — and hands the titles to a popover on hover or click. Titles used to
 * be set directly in the cell, which only worked at a wide viewport: a month
 * cell is a seventh of the page, and once the actions menu and the tag dots had
 * taken their width a real entry rendered as "A…". A truncation that severe is
 * not a shortened title, it is a smudge, and six rows of them read as damage
 * rather than as a month of writing.
 *
 * The popover is where the width is: full titles, the clock the cell cannot
 * afford, named tag chips instead of dots, and the same per-note menu the rest
 * of the app uses.
 */
export const MonthCell = ({
  day,
  notes,
  outside,
  isToday,
  isSelected,
  journalId,
  range,
  onSelectDay,
  onOpenDay,
}: {
  day: Date;
  notes: CalendarNote[];
  /** Day belongs to a neighbouring month, so it recedes. */
  outside: boolean;
  isToday: boolean;
  isSelected: boolean;
  journalId: string;
  range: RangeKey;
  onSelectDay: (day: Date) => void;
  onOpenDay: (day: Date) => void;
}) => {
  const hidden = Math.max(0, notes.length - MAX_DOTS);
  const countLabel = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;

  return (
    <div
      // Clicking the empty part of a cell selects it. Not a button — the cell
      // contains a day-number button and a popover trigger, and a nested
      // interactive element inside a button is neither valid nor operable. That
      // leaves this click mouse-only, which is why it is an enhancement rather
      // than the only route: both children are focusable and reach the same day.
      onClick={() => onSelectDay(day)}
      className={cn(
        "flex min-h-20 flex-col border-t border-l border-border/60 p-1 text-left transition-colors sm:min-h-24",
        // The header already draws the grid's top edge, and the container clips
        // its left one.
        "[&:nth-child(7n+1)]:border-l-0 [&:nth-child(-n+7)]:border-t-0",
        // Days outside the month recede rather than getting a fill of their own.
        // A `bg-muted/30` block put a second colour into the grid to encode
        // something the dimmed numbers already say, and on paper it read as a
        // stain rather than as "not this month".
        outside ? "opacity-45" : "hover:bg-muted/40",
        isSelected && "bg-accent/70 hover:bg-accent/70",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDay(day);
          }}
          aria-label={`${format(day, "EEEE, MMMM d, yyyy")}${
            notes.length === 0 ? ", no notes" : `, ${countLabel}`
          }`}
          className={cn(
            "flex size-6 items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            outside && "text-muted-foreground",
            // A clay ring, not a filled ink disc. Today is worth marking, but a
            // solid black circle is the heaviest mark on the grid — heavier than
            // any actual entry — which puts the emphasis on the date rather than
            // on what was written.
            isToday && "text-brand ring-1 ring-brand hover:bg-brand/10",
          )}
        >
          {format(day, "d")}
        </button>
        {/* The dots are capped and, past a handful, uncountable at a glance.
            This is the number they stand for. */}
        {notes.length > 0 && (
          <span
            aria-hidden
            className="pr-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            {notes.length}
          </span>
        )}
      </div>

      {notes.length > 0 && (
        <Popover>
          {/* The trigger takes the rest of the cell rather than hugging the
              dots: a 6px target is not one, and the whole area under the date
              already means "this day's notes". The click still bubbles to the
              cell, so opening the list also selects the day. */}
          <PopoverTrigger
            openOnHover
            // Long enough that dragging the pointer across a full month does not
            // trail popovers behind it; short enough to feel like a hover.
            delay={350}
            closeDelay={120}
            aria-label={`${countLabel} on ${format(day, "EEEE, MMMM d, yyyy")}`}
            className={cn(
              "mt-1 flex w-full flex-1 flex-wrap content-start items-center gap-1 rounded-sm px-1 py-1",
              "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            {notes.slice(0, MAX_DOTS).map((note) => (
              <span
                key={note.id}
                // Decoration: the trigger's label already says how many notes
                // this is, and the popover carries what they are.
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  // Coloured by the note's first tag, which is what the filter
                  // bar above the grid sorts by, so a filtered month and an
                  // unfiltered one agree about which dots are which. An untagged
                  // note gets ink rather than a ninth hue — it is not a category.
                  note.tags[0]
                    ? tagDotClasses(note.tags[0].name)
                    : "bg-foreground/35",
                )}
              />
            ))}
            {hidden > 0 && (
              <span
                aria-hidden
                className="font-mono text-[9px] leading-none tabular-nums text-muted-foreground"
              >
                +{hidden}
              </span>
            )}
          </PopoverTrigger>

          {/* Portalled, so nothing in here bubbles back to the cell's select. */}
          <PopoverContent align="start" className="w-80 gap-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <p className="font-serif text-sm">
                {format(day, "EEEE, MMMM d")}
              </p>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {countLabel}
              </span>
            </div>

            {/* Every note, not a capped slice: this is the thing the cap in the
                cell defers to, so truncating again here would leave the overflow
                with nowhere to be read. */}
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {notes.map((note) => (
                <NoteEvent
                  key={note.id}
                  note={note}
                  journalId={journalId}
                  range={range}
                  showTime
                  tagStyle="chips"
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="justify-start font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase"
              onClick={() => onOpenDay(day)}
            >
              Open day view
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
