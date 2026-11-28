import { monthTitle } from "@/lib/calendar";
import { parseISO } from "date-fns";

/** One month header in the note list and the rows under it. */
export type MonthGroup<T> = {
  /** `yyyy-MM`. */
  month: string;
  /** "July 2026". */
  title: string;
  notes: T[];
};

/**
 * Cuts the list's newest-first rows into runs by the reader's calendar month,
 * keeping their order. The rows' `day` is already in the reader zone, so the
 * month is read straight off it rather than from an instant.
 */
export function groupByMonth<T extends { day: string }>(
  notes: readonly T[],
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];

  for (const note of notes) {
    const month = note.day.slice(0, 7);
    const current = groups.at(-1);

    if (current?.month === month) {
      current.notes.push(note);
    } else {
      groups.push({
        month,
        title: monthTitle(parseISO(note.day)),
        notes: [note],
      });
    }
  }

  return groups;
}
