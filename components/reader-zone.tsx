"use client";

import { formatDateTimeInZone, formatDayInZone } from "@/lib/format";
import {
  clientTimeZone,
  dayKeyInTimeZone,
  resolveTimeZone,
  zonedDayAndMinutes,
} from "@/lib/timezone";
import { createContext, use, useSyncExternalStore } from "react";

/**
 * The client half of the reader calendar (ADR-0001): which zone the person
 * looking at the page is in, what today is for them, and how to print a date.
 *
 * Mounted by a server page, seeded with the zone from the `tz` cookie. That seed
 * is what the server render answers with — never the Node process's zone — so the
 * first paint is cut in the same zone the server prefetch was, and nothing swaps
 * on hydration.
 *
 * The seed is only the *hydration* snapshot, though. Once mounted, the browser's
 * own zone wins: on a first visit, before the cookie exists, the seed is UTC and
 * the page settles into the reader zone on the first commit after hydration,
 * which React treats as an update rather than a mismatch. On every later visit
 * the cookie and the browser agree and nothing re-renders.
 */

export type ReaderZone = {
  /** The reader zone, as an IANA name. */
  readonly zone: string;
  /** The reader's calendar day (`yyyy-MM-dd`) right now. */
  readonly today: string;
  /** `"Sun 2 Aug 2026"`, on the reader's calendar. */
  formatDay(date: Date): string;
  /** `"2 Aug 2026 at 9:52 AM"`, on the reader's wall clock. */
  formatDateTime(date: Date): string;
};

const ReaderZoneContext = createContext<ReaderZone | null>(null);

/** A reader's zone does not change under a mounted page — nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * Re-reads the clock once a minute.
 *
 * Coarser than the day it guards, but cheap: `useSyncExternalStore` compares the
 * snapshot and only re-renders when the day label actually changes, so this
 * costs one string comparison a minute and keeps "today" right for anyone who
 * leaves the page open overnight — which, for a journal, is the normal way to
 * use it. Timing a wake-up for the reader zone's midnight instead would need
 * the tz database this module is not allowed to ship (ADR-0001).
 */
function subscribeToMinute(onStoreChange: () => void) {
  const timer = setInterval(onStoreChange, 60_000);
  return () => clearInterval(timer);
}

export function ReaderZoneProvider({
  initialZone,
  children,
}: {
  /** The zone the server rendered in — from the `tz` cookie, UTC without one. */
  initialZone: string;
  children: React.ReactNode;
}) {
  const seed = resolveTimeZone(initialZone);

  const zone = useSyncExternalStore(noSubscribe, clientTimeZone, () => seed);

  const readToday = () => dayKeyInTimeZone(new Date(), zone);
  const today = useSyncExternalStore(subscribeToMinute, readToday, readToday);

  const value: ReaderZone = {
    zone,
    today,
    formatDay: (date) => formatDayInZone(date, zone),
    formatDateTime: (date) => formatDateTimeInZone(date, zone),
  };

  return <ReaderZoneContext value={value}>{children}</ReaderZoneContext>;
}

/** The reader zone, today and date formatting for the person reading the page. */
export function useReaderZone(): ReaderZone {
  const readerZone = use(ReaderZoneContext);

  if (!readerZone) {
    throw new Error(
      "useReaderZone() needs a <ReaderZoneProvider> above it; mount one in the page.",
    );
  }

  return readerZone;
}

/**
 * Minutes past the reader's midnight, for the time grid's "now" line — or
 * `null` during the server render.
 *
 * Its own hook rather than a field on `useReaderZone`: it ticks every minute,
 * and only the component that draws the line should re-render when it does.
 *
 * Null server-side, deliberately. The line marks the reader's current time to
 * the minute, and a server-rendered one would be stale by the time it hydrated
 * and jump. Drawing nothing until the browser can answer is the honest version.
 */
export function useNowMinutes(): number | null {
  const { zone } = useReaderZone();

  return useSyncExternalStore(
    subscribeToMinute,
    () => zonedDayAndMinutes(new Date(), zone).minutes,
    () => null,
  );
}
