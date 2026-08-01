"use client";

import { NoteRowActions, type RangeKey } from "@/components/note-row-actions";
import { TagChip } from "@/components/tags/tag-chip";
import { TagDot } from "@/components/tags/tag-dot";
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
  /** Name-sorted, and `[]` for an untagged note — never absent. */
  tags: { id: string; name: string }[];
};

/** How many named chips fit before the rest collapse into a count. */
const MAX_CHIPS = 2;

/** Likewise for dots, which sit in a month cell a seventh of the page wide. */
const MAX_DOTS = 3;

/**
 * A note on the grid.
 *
 * A borderless row of text, not a filled pill. `border-primary/20 bg-primary/10`
 * on every entry was the single loudest thing on the page: it rendered a month of
 * writing as a wall of Google-Calendar event blocks, which asserts that an entry
 * is an *appointment* — a thing scheduled at a time, in a slot, next to other
 * things competing for it. A journal entry is none of that. Set as a line of
 * serif with its tag dots leading and a fill only under the pointer, a month cell
 * reads as a short list of what was written that day, which is what it is.
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
  tagStyle = "none",
  className,
}: {
  note: CalendarNote;
  journalId: string;
  range: RangeKey;
  showTime?: boolean;
  /**
   * How much room the caller has for tags, mirroring the `showTime` convention:
   * named chips where there is width, dots where there is not, nothing where
   * even a dot row would crowd the title.
   */
  tagStyle?: "chips" | "dots" | "none";
  className?: string;
}) => {
  const title = note.title || "Untitled note";
  const hasTags = note.tags.length > 0 && tagStyle !== "none";
  const hiddenChips = Math.max(0, note.tags.length - MAX_CHIPS);
  const hiddenDots = Math.max(0, note.tags.length - MAX_DOTS);

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
          "flex h-full w-full items-baseline gap-1.5 overflow-hidden rounded-sm",
          "px-1 py-0.5 text-left text-xs",
          "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          // Room for the menu, so a long title does not run underneath it.
          "pr-6",
        )}
      >
        {showTime && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatMinutes(note.minutes)}
          </span>
        )}
        {/* Inside the link, so the whole chip stays one target, and
            `pointer-events-none` so a tag can never swallow the click that was
            meant to open the note. The tags themselves are not interactive
            here — filtering lives in the bar above the grid.

            Dots lead, named chips trail. Without a pill around the row there is
            no longer a left edge for the title to start from, so the dots become
            that edge — a colour bullet the eye can run down the cell. Chips are
            wide enough to be their own block and stay pinned right, where they
            do not push the title's first letter off the column. */}
        {hasTags && tagStyle === "dots" && (
          <span
            className="pointer-events-none flex shrink-0 items-center gap-0.5 self-center"
            // The dot row is `shrink-0`, so an uncapped one would take width
            // from the title without limit. Capped, the overflow still has to
            // stay reachable — hence the full list here.
            title={
              hiddenDots > 0
                ? note.tags.map((tag) => tag.name).join(", ")
                : undefined
            }
          >
            {note.tags.slice(0, MAX_DOTS).map((tag) => (
              <TagDot key={tag.id} name={tag.name} />
            ))}
            {hiddenDots > 0 && (
              <span
                aria-label={`${hiddenDots} more`}
                className="text-[9px] leading-none text-muted-foreground tabular-nums"
              >
                +{hiddenDots}
              </span>
            )}
          </span>
        )}

        <span className="truncate font-serif text-[13px] leading-tight">
          {title}
        </span>

        {hasTags && tagStyle === "chips" && (
          <span className="pointer-events-none ml-auto flex shrink-0 items-center gap-1">
            {note.tags.slice(0, MAX_CHIPS).map((tag) => (
              <TagChip key={tag.id} name={tag.name} size="sm" />
            ))}
            {hiddenChips > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                +{hiddenChips}
              </span>
            )}
          </span>
        )}
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
