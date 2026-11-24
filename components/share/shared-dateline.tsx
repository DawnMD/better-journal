"use client";

import { useReaderZone } from "@/components/reader-zone";

/**
 * The date a shared entry was written, on the *reader's* calendar.
 *
 * A client component for the same reason the editor's dateline is one: the
 * reader zone is the browser's, and the server can only seed it from the `tz`
 * cookie. A recipient following a link has almost certainly never been here, so
 * that cookie is usually missing and the seed is usually UTC — the reader-zone
 * provider swaps in the real zone on the first commit, which React treats as an
 * update rather than a hydration mismatch.
 */
export function SharedDateline({
  /** ISO 8601, so the prop crosses the server boundary as a string. */
  createdAt,
}: {
  createdAt: string;
}) {
  const { formatDay } = useReaderZone();

  return (
    <div className="mb-3 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
      <time dateTime={createdAt}>{formatDay(new Date(createdAt))}</time>
    </div>
  );
}
