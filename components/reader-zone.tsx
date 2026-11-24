"use client";

import { DISPLAY_LOCALE } from "@/lib/format";
import {
  dayKeyInTimeZone,
  DEFAULT_TIME_ZONE,
  resolveTimeZone,
  TZ_COOKIE,
  zonedDayAndMinutes,
} from "@/lib/reader-calendar-core";
import {
  createContext,
  use,
  useEffect,
  useSyncExternalStore,
} from "react";

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
 *
 * The only module allowed to ask the browser for its zone — a lint rule holds
 * everything else to `useReaderZone()`.
 */

/** The browser's zone, or UTC where `Intl` cannot say. */
function browserZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
    );
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Publishes the browser's zone to the `tz` cookie, so server pages can seed
 * their `ReaderZoneProvider` and key their prefetches on the zone the client
 * will use.
 *
 * Renders nothing. Writes only when the value actually changed, so it is a no-op
 * on every navigation after the first (and after a flight across timezones, it
 * corrects itself on the next mount).
 */
export function ReaderZoneCookieSync() {
  useEffect(() => {
    const zone = browserZone();

    const current = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);

    if (current === zone) return;

    // Written raw, not percent-encoded. IANA zone names are made of
    // [A-Za-z0-9_+/-], all of which are legal cookie-octets, and encoding the
    // "/" in "Asia/Kolkata" would hand the server "Asia%2FKolkata" — which fails
    // Intl validation and silently falls back to UTC.
    if (!/^[A-Za-z0-9_+/-]+$/.test(zone)) return;

    // Not HttpOnly: it is written by the client, and it carries no secret.
    // Lax matches how it is read — same-site navigations only.
    document.cookie = `${TZ_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return null;
}

/**
 * Formatters are cached per zone: constructing an `Intl.DateTimeFormat` loads
 * the zone's transition table, and a table of trashed notes prints dozens.
 *
 * Assembled from `formatToParts` rather than handed to `dateStyle`/`timeStyle`
 * because these two shapes are the ones the pages already show, and `en-US`'s
 * built-in styles are neither of them. The locale is pinned for the reason
 * lib/format.ts gives.
 */
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(
  date: Date,
  zone: string,
): Record<Intl.DateTimeFormatPartTypes, string> {
  let formatter = zonedFormatters.get(zone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    zonedFormatters.set(zone, formatter);
  }

  const parts = {} as Record<Intl.DateTimeFormatPartTypes, string>;
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;

  return parts;
}

function formatDayInZone(date: Date, zone: string): string {
  const { weekday, day, month, year } = zonedParts(date, zone);
  return `${weekday} ${day} ${month} ${year}`;
}

function formatDateTimeInZone(date: Date, zone: string): string {
  const { day, month, year, hour, minute, dayPeriod } = zonedParts(date, zone);
  return `${day} ${month} ${year} at ${hour}:${minute} ${dayPeriod}`;
}

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

  const zone = useSyncExternalStore(noSubscribe, browserZone, () => seed);

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
