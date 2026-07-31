/**
 * Calendar geometry, with no React in it.
 *
 * Everything the month / week / day views need in order to agree on *which days
 * are on screen* lives here, because two callers have to compute it identically:
 * the server page, which prefetches the note range, and the client component,
 * which queries it. A range derived twice by two different code paths is a
 * guaranteed cache miss on first paint.
 *
 * Deliberately free of `@date-fns/tz`. Nothing here decides which calendar day a
 * *note* belongs to — that is the server's job, in the reader's zone, via
 * `zonedDayAndMinutes`. These functions only lay out a grid, so plain local-date
 * arithmetic is the right tool and keeps the tz database out of this bundle.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const DAY_KEY = "yyyy-MM-dd";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const DEFAULT_VIEW: CalendarView = "month";

/** Sunday, matching the month picker this replaced. */
const WEEK_STARTS_ON = 0 as const;

/**
 * Month grids are always six weeks tall.
 *
 * A grid that grew and shrank with the month would jump the whole page by a row
 * whenever you paged from February to March. Six is the tallest a month can be,
 * so it is the only height that never moves.
 */
const MONTH_WEEKS = 6;

/** Narrows an untrusted `?view=` value. */
export function resolveView(view: string | null | undefined): CalendarView {
  return CALENDAR_VIEWS.includes(view as CalendarView)
    ? (view as CalendarView)
    : DEFAULT_VIEW;
}

/**
 * Narrows an untrusted `?date=` value to a real `yyyy-MM-dd`, or `fallback`.
 *
 * Both the shape and the *date* are checked: `parseISO` accepts far more than
 * this format and returns an Invalid Date for the rest, which every `format`
 * call downstream then throws on. That is a 500 on the server page and an error
 * boundary in the browser — for a mistyped query string in a shared link, which
 * should just open on today instead.
 */
export function resolveDayKey(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !ISO_DATE.test(value)) return fallback;

  // Catches the well-formed impossibilities the regex cannot — "2026-02-31",
  // "2026-13-01" — which parse to an Invalid Date rather than being rejected.
  return isValid(parseISO(value)) ? value : fallback;
}

/** Every day the given view draws, in order. 42, 7 or 1 of them. */
export function visibleDays(anchor: Date, view: CalendarView): Date[] {
  if (view === "day") return [anchor];

  const first =
    view === "month"
      ? startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON })
      : startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });

  const length = view === "month" ? MONTH_WEEKS * 7 : 7;

  return Array.from({ length }, (_, index) => addDays(first, index));
}

/**
 * The inclusive `yyyy-MM-dd` bounds of the visible grid — the shape the range
 * query takes as input.
 */
export function rangeKeys(
  anchor: Date,
  view: CalendarView,
): { start: string; end: string } {
  const days = visibleDays(anchor, view);

  return {
    start: format(days[0]!, DAY_KEY),
    end: format(days[days.length - 1]!, DAY_KEY),
  };
}

/** One step forward (`+1`) or back (`-1`), in whatever unit the view is made of. */
export function shiftAnchor(
  anchor: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  if (view === "month") return addMonths(anchor, direction);
  if (view === "week") return addWeeks(anchor, direction);
  return addDays(anchor, direction);
}

/** The heading above the grid: "July 2026", "Jul 26 – Aug 1, 2026", "Thursday, July 30, 2026". */
export function viewTitle(anchor: Date, view: CalendarView): string {
  if (view === "month") return format(anchor, "MMMM yyyy");
  if (view === "day") return format(anchor, "EEEE, MMMM d, yyyy");

  const first = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const last = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });

  // The year is stated once, and the month only when the week straddles two.
  return format(first, "MMM d") === format(last, "MMM d")
    ? format(first, "MMM d, yyyy")
    : `${format(first, "MMM d")} – ${format(
        last,
        first.getMonth() === last.getMonth() ? "d, yyyy" : "MMM d, yyyy",
      )}`;
}

/**
 * `545` → `"9:05 AM"`.
 *
 * Assembled by hand rather than through `Intl`, because the input is already a
 * plain integer computed server-side in the reader's zone. Handing it back to a
 * `Date` just to format it would reintroduce the browser's zone at the last
 * step, and pinning a locale would still leave the ambient-calendar problem.
 */
export function formatMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** Anything the grid can place: a note, reduced to when it happened. */
type Timed = { minutes: number };

export type Placed<T> = {
  event: T;
  /** Which of `columns` side-by-side lanes this event sits in. */
  column: number;
  /** How many lanes its cluster needed. */
  columns: number;
};

/**
 * How much of the time axis one note is treated as occupying, in minutes.
 *
 * A note is an instant, not a span, so this is purely about legibility: a chip
 * needs enough height to hold a title, and two notes written within half an hour
 * of each other would draw on top of one another without it.
 */
export const SLOT_MINUTES = 30;

/**
 * Lays overlapping events out side by side, the way a day planner does.
 *
 * Events are swept in time order into *clusters* — runs that transitively
 * overlap — and within a cluster each event takes the first lane that has come
 * free. Every event in a cluster then reports the cluster's total lane count, so
 * they all render at the same width and tile the column exactly. Sizing each
 * event off its own overlaps instead leaves ragged gaps where a cluster is
 * denser in the middle than at its edges.
 */
export function packEvents<T extends Timed>(events: T[]): Placed<T>[] {
  const sorted = [...events].sort((a, b) => a.minutes - b.minutes);

  const placed: Placed<T>[] = [];
  /** The current cluster's entries, held so their `columns` can be set on flush. */
  let cluster: Placed<T>[] = [];
  /** When each lane next comes free. Index is the lane number. */
  let laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    for (const entry of cluster) entry.columns = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const event of sorted) {
    // Sorted by start, so an event beginning after everything placed so far has
    // ended cannot overlap any of them — the cluster is closed.
    if (event.minutes >= clusterEnd) flush();

    const end = event.minutes + SLOT_MINUTES;

    let column = laneEnds.findIndex((laneEnd) => laneEnd <= event.minutes);
    if (column === -1) column = laneEnds.length;

    laneEnds[column] = end;
    clusterEnd = Math.max(clusterEnd, end);

    // Pushed to both lists: `placed` preserves the result, `cluster` is the
    // window whose `columns` is still to be decided. Same objects, so setting it
    // on flush is visible in both.
    const entry: Placed<T> = { event, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
  }

  flush();

  return placed;
}
