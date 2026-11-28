"use client";

import { TagChip } from "@/components/tags/tag-chip";
import { groupByMonth } from "@/lib/note-list";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";

export type ListNote = {
  id: string;
  title: string | null;
  day: string;
  preview: string;
  tags: { id: string; name: string }[];
};

/** The DOM id of the first row on `day`, which a calendar click scrolls to. */
export const dayElementId = (day: string) => `day-${day}`;

/** How far ahead of the viewport the next page starts loading. */
const PRELOAD_MARGIN = "800px";

/**
 * Below the sticky top bar: the row whose day the calendar should show is the
 * first one under this line, not the first one under the window's top edge.
 */
const READING_LINE_PX = 96;

/**
 * Every note in the journal, newest first, under month headers.
 *
 * Window-scrolled, not a scroll box: the browser restores a window's scroll
 * position on Back by itself, which is what brings the reader back to the row
 * they opened — as long as the same pages are still cached to render.
 */
export const NoteList = ({
  journalId,
  notes,
  hasOlder,
  hasNewer,
  isFetchingOlder,
  isFetchingNewer,
  onLoadOlder,
  onLoadNewer,
  onTopDayChange,
}: {
  journalId: string;
  notes: ListNote[];
  hasOlder: boolean;
  hasNewer: boolean;
  isFetchingOlder: boolean;
  isFetchingNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  /** The day of the row at the top of the viewport, as the list scrolls. */
  onTopDayChange: (day: string) => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<HTMLDivElement>(null);
  const newerRef = useRef<HTMLDivElement>(null);

  // Newer pages land *above* what the reader is looking at. Without holding
  // the viewport on the row it was showing, every one of them would shove the
  // list down by its own height. Done by hand (with the browser's own scroll
  // anchoring switched off on the list) because Safari has none.
  const heldRow = useRef<{ id: string; top: number } | null>(null);

  const loadNewer = () => {
    const first = listRef.current?.querySelector<HTMLElement>("[data-note]");
    heldRow.current = first
      ? { id: first.dataset.note!, top: first.getBoundingClientRect().top }
      : null;
    onLoadNewer();
  };

  const firstId = notes[0]?.id;
  useLayoutEffect(() => {
    const held = heldRow.current;
    if (!held || firstId === held.id) return;

    heldRow.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-note="${held.id}"]`,
    );
    if (row) window.scrollBy(0, row.getBoundingClientRect().top - held.top);
  }, [firstId]);

  // Infinite loading at both ends. An effect event, so the observers read the
  // latest paging state without being torn down and rebuilt on every render.
  const onSentinel = useEffectEvent((target: Element) => {
    if (target === olderRef.current && hasOlder && !isFetchingOlder) {
      onLoadOlder();
    }
    if (target === newerRef.current && hasNewer && !isFetchingNewer) {
      loadNewer();
    }
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onSentinel(entry.target);
        }
      },
      { rootMargin: `${PRELOAD_MARGIN} 0px` },
    );

    if (olderRef.current) observer.observe(olderRef.current);
    if (newerRef.current) observer.observe(newerRef.current);

    return () => observer.disconnect();
    // Re-observed when a page lands, so a sentinel still in view after the
    // load (a short page) fires again instead of stalling.
  }, [notes.length]);

  // The calendar follows the row under the reading line.
  const reportTop = useEffectEvent((day: string) => onTopDayChange(day));

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-day]");
      if (!rows) return;

      for (const row of rows) {
        if (row.getBoundingClientRect().bottom > READING_LINE_PX) {
          reportTop(row.dataset.day!);
          return;
        }
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const groups = groupByMonth(notes);
  const firstOfDay = new Set<string>();

  return (
    <div ref={listRef} aria-label="Notes" role="region" className="[overflow-anchor:none]">
      <div ref={newerRef} aria-hidden className="h-px" />
      {isFetchingNewer && <LoadingRow />}

      {groups.map((group) => (
        <section key={group.month} aria-labelledby={`month-${group.month}`}>
          <h3
            id={`month-${group.month}`}
            className="mt-6 mb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase first:mt-0"
          >
            {group.title}
          </h3>

          <ol className="divide-y divide-border/60">
            {group.notes.map((note) => {
              const isFirstOfDay = !firstOfDay.has(note.day);
              firstOfDay.add(note.day);

              return (
                <li
                  key={note.id}
                  id={isFirstOfDay ? dayElementId(note.day) : undefined}
                  data-note={note.id}
                  data-day={note.day}
                  // Clear of the sticky top bar when scrolled to from the calendar.
                  className="scroll-mt-24"
                >
                  <Link
                    href={`/journal/${journalId}/${note.id}`}
                    className="-mx-2 block rounded-md px-2 py-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate font-serif text-base">
                        {note.title || "Untitled"}
                      </span>
                      <time
                        dateTime={note.day}
                        className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                      >
                        {format(parseISO(note.day), "EEE, MMM d")}
                      </time>
                    </div>

                    {note.preview && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground text-pretty">
                        {note.preview}
                      </p>
                    )}

                    {note.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {note.tags.map((tag) => (
                          <TagChip key={tag.id} name={tag.name} size="sm" />
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {isFetchingOlder && <LoadingRow />}
      <div ref={olderRef} aria-hidden className="h-px" />
    </div>
  );
};

const LoadingRow = () => (
  <p
    role="status"
    className={cn(
      "py-4 text-center font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase",
    )}
  >
    Loading…
  </p>
);
