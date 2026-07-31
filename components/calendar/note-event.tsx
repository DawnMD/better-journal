"use client";

import { NoteRowActions, type RangeKey } from "@/components/note-row-actions";
import { formatMinutes } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** One note, as the calendar sees it. Mirrors `notesRouter.getNotesInRange`. */
export type CalendarNote = {
  id: string;
  title: string | null;
  createdAt: Date;
  /** `yyyy-MM-dd`, bucketed server-side in the reader's zone. */
  day: string;
  /** Minutes past local midnight, likewise. */
  minutes: number;
};

/**
 * A note on the grid.
 *
 * The whole chip is a link, with the actions menu overlaid rather than nested —
 * a `<button>` inside an `<a>` is invalid HTML and, more practically, makes the
 * menu impossible to click without also navigating. The menu is transparent
 * until the chip is hovered or something inside it is focused, so a dense month
 * cell is not a wall of "⋯", but it stays in the tab order either way.
 */
export const NoteEvent = ({
  note,
  journalId,
  range,
  showTime = true,
  className,
}: {
  note: CalendarNote;
  journalId: string;
  range: RangeKey;
  showTime?: boolean;
  className?: string;
}) => {
  const title = note.title || "Untitled note";

  return (
    <div
      // The month grid selects a day when its cell is clicked. A click that
      // landed on a note meant the note, so it stops here rather than also
      // moving the selection out from under the navigation.
      onClick={(event) => event.stopPropagation()}
      className={cn("group/event relative", className)}
    >
      <Link
        href={`/journal/${journalId}/${note.id}`}
        className={cn(
          "flex h-full w-full items-baseline gap-1.5 overflow-hidden rounded-md",
          "border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-left text-xs",
          "hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          // Room for the menu, so a long title does not run underneath it.
          "pr-6",
        )}
      >
        {showTime && (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {formatMinutes(note.minutes)}
          </span>
        )}
        <span className="truncate font-medium">{title}</span>
      </Link>

      <NoteRowActions
        noteId={note.id}
        title={note.title ?? ""}
        journalId={journalId}
        range={range}
        className={cn(
          "absolute top-0 right-0.5 size-5",
          "opacity-0 transition-opacity group-hover/event:opacity-100",
          // Kept visible while it holds focus or its menu is open — otherwise
          // tabbing to it, or opening it, would hide the thing you are using.
          "focus-visible:opacity-100 aria-expanded:opacity-100",
        )}
      />
    </div>
  );
};
