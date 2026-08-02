"use client";

import { useTimeZone } from "@/components/use-time-zone";
import { formatDayInZone } from "@/lib/format";

/**
 * The date a shared entry was written, in the *reader's* zone.
 *
 * A client component for the same reason the editor's dateline is one: the zone
 * is the browser's, and the server can only guess it from the `tz` cookie. A
 * recipient following a link has almost certainly never been here, so that
 * cookie is usually missing and the guess is usually UTC — `useTimeZone` swaps in
 * the real zone on the first commit, which React treats as an update rather than
 * a hydration mismatch.
 */
export function SharedDateline({
  /** ISO 8601, so the prop crosses the server boundary as a string. */
  createdAt,
  serverTimeZone,
}: {
  createdAt: string;
  serverTimeZone: string;
}) {
  const timeZone = useTimeZone(serverTimeZone);
  const date = new Date(createdAt);

  return (
    <div className="mb-3 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
      <time dateTime={createdAt}>{formatDayInZone(date, timeZone)}</time>
    </div>
  );
}
