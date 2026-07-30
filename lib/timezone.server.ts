import { cookies } from "next/headers";
import { resolveTimeZone, TZ_COOKIE } from "./timezone";

/**
 * The reader's timezone as best the server can know it: from the `tz` cookie
 * written by `<TimeZoneSync />`, falling back to UTC.
 *
 * Used only so server-side prefetches produce the same oRPC query key the client
 * will produce. On a visitor's very first request the cookie does not exist yet,
 * so the prefetch keys on UTC, misses, and the client fetches once; every
 * subsequent navigation hits. Correctness never depends on this value — the
 * authoritative zone is the one the client sends as a procedure input.
 */
export async function serverTimeZone(): Promise<string> {
  const store = await cookies();
  return resolveTimeZone(store.get(TZ_COOKIE)?.value);
}
