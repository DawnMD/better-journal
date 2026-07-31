"use client";

import { DAY_KEY } from "@/lib/calendar";
import { format } from "date-fns";
import { useSyncExternalStore } from "react";

/**
 * Schedules a re-read just after each local midnight, then re-arms.
 *
 * Without this the "today" ring and the now-indicator would stay on yesterday
 * for anyone who leaves the page open overnight — which, for a journal, is the
 * normal way to use it. The 100ms cushion keeps a timer that fires a hair early
 * from reading the *previous* day and immediately rescheduling itself for zero
 * milliseconds later.
 */
function subscribe(onStoreChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;

  const arm = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 100);

    timer = setTimeout(() => {
      onStoreChange();
      arm();
    }, midnight.getTime() - now.getTime());
  };

  arm();

  return () => clearTimeout(timer);
}

/** Safe as a `getSnapshot`: the value only changes at midnight, and `subscribe` says so. */
const browserToday = () => format(new Date(), DAY_KEY);

/**
 * Today's `yyyy-MM-dd`, as the browser sees it.
 *
 * `serverToday` is the server's best guess — derived from the `tz` cookie — and
 * is used as the hydration snapshot. It has to be: the server renders this
 * component too, and if it answered with the Node process's date (UTC on Vercel)
 * while the browser answered with the reader's, React would tear down the whole
 * grid on hydration over a mismatched `data-today`. Where the two genuinely
 * disagree — a first visit, before the cookie exists — the browser's answer wins
 * on the first commit.
 */
export function useToday(serverToday: string): string {
  return useSyncExternalStore(subscribe, browserToday, () => serverToday);
}

/** Re-reads the clock once a minute, which is the resolution the line is drawn at. */
function subscribeToMinute(onStoreChange: () => void) {
  const timer = setInterval(onStoreChange, 60_000);
  return () => clearInterval(timer);
}

const browserNowMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * Minutes past local midnight, for the time grid's "now" line — or `null`
 * server-side.
 *
 * Null rather than the server's clock, deliberately. The line marks *the
 * reader's* current time, and a server rendering it at its own would put it
 * hours off and then jump it on hydration. Rendering nothing until the browser
 * can answer is the honest version.
 */
export function useNowMinutes(): number | null {
  return useSyncExternalStore(
    subscribeToMinute,
    browserNowMinutes,
    () => null,
  );
}
