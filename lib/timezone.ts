/**
 * Timezone plumbing shared by client and server.
 *
 * Deliberately free of `date-fns` / `@date-fns/tz` imports so it can be pulled
 * into a client component without dragging the tz database into the browser
 * bundle. The actual day-boundary arithmetic lives in
 * `server/lib/day-window.ts`, which builds on this.
 */

export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Cookie the client writes with its resolved IANA zone.
 *
 * It exists so *server* prefetches can build the same oRPC query key the client
 * will build. The server cannot detect a timezone from an HTTP request, so
 * without this the first render's prefetch key (UTC) would never match the
 * client's (say, Asia/Kolkata) and every prefetch would be wasted work.
 *
 * Not a security boundary — it only decides which day a note is filed under, and
 * `resolveTimeZone` rejects anything that is not a real zone.
 */
export const TZ_COOKIE = "tz";

/** True if the runtime recognises `timeZone` as an IANA zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalises untrusted zone input, falling back to UTC.
 *
 * The zone reaches the server as a procedure input and as a cookie, both
 * attacker-controllable. An unknown zone makes `Intl` throw `RangeError`, which
 * would surface as a 500 from a read endpoint — so we degrade instead.
 */
export function resolveTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone || !isValidTimeZone(timeZone)) return DEFAULT_TIME_ZONE;
  return timeZone;
}

/** The browser's zone, or UTC where `Intl` cannot say. */
export function clientTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
    );
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * The `yyyy-MM-dd` label a UTC instant carries in `timeZone`.
 *
 * `en-CA` is a deliberate shortcut: its short date format is already
 * ISO-ordered, so there is no need to reassemble `formatToParts` by hand.
 */
export function dayKeyInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The `yyyy-MM` label a UTC instant carries in `timeZone`. */
export function monthKeyInTimeZone(instant: Date, timeZone: string): string {
  return dayKeyInTimeZone(instant, timeZone).slice(0, 7);
}
