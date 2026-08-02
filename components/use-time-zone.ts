"use client";

import { clientTimeZone } from "@/lib/timezone";
import { useSyncExternalStore } from "react";

/** A reader's zone does not change under a mounted page — nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * The zone to render timestamps in: the browser's, or the server's guess until
 * the browser can answer.
 *
 * Same shape and same reasoning as `useToday` — `serverZone` comes from the `tz`
 * cookie and is only ever a guess, so it is the *hydration* snapshot rather than
 * the value. Rendering the server's own zone instead would put every timestamp
 * hours off on first paint and then tear the tree down over the mismatch; going
 * through `useSyncExternalStore` lets the browser's answer replace it on the
 * first commit, which React treats as an update rather than a hydration error.
 *
 * Where the cookie is already set — every visit after the first — the two agree
 * and nothing re-renders.
 */
export function useTimeZone(serverZone: string): string {
  return useSyncExternalStore(noSubscribe, clientTimeZone, () => serverZone);
}
