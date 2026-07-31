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

/**
 * Formatters are cached per zone. Constructing an `Intl.DateTimeFormat` is the
 * expensive part of this — it loads a zone's transition table — and the calendar
 * calls `zonedDayAndMinutes` once per note in the visible range.
 */
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(zone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      // h23, not `hour12: false` — the latter renders midnight as "24" under
      // some ICU builds, which would place a 00:15 note at the bottom of the
      // previous day's column.
      hourCycle: "h23",
    });
    partFormatters.set(zone, formatter);
  }

  return formatter;
}

/**
 * Where a UTC instant falls on `timeZone`'s calendar: which day, and how many
 * minutes into it.
 *
 * The calendar's time grid needs both, and it must not derive either in the
 * browser. The client renders whatever zone the *query* was made in, which is
 * usually — but not necessarily — the browser's own, and a `Date` getter would
 * silently answer for the browser's. Computing both here, once, from the same
 * zone the notes were fetched under keeps the grid and the query in agreement.
 */
export function zonedDayAndMinutes(
  instant: Date,
  timeZone: string,
): { day: string; minutes: number } {
  const parts = partFormatter(resolveTimeZone(timeZone)).formatToParts(instant);

  const lookup = {} as Record<Intl.DateTimeFormatPartTypes, string>;
  for (const part of parts) lookup[part.type] = part.value;

  return {
    day: `${lookup.year}-${lookup.month}-${lookup.day}`,
    minutes: Number(lookup.hour) * 60 + Number(lookup.minute),
  };
}
