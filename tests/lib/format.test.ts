import { describe, expect, it } from "vitest";
import { formatDateTimeInZone, formatDayInZone } from "@/lib/format";

/**
 * Timestamps are rendered in an explicit zone, not the ambient one.
 *
 * The bug this covers: the editor's dateline and the trash table both used
 * `format()` from date-fns, which reads a `Date` through whatever zone the
 * runtime is set to. That is the browser's on the client and the Node process's
 * during SSR — UTC on Vercel — so a note written at 02:00 IST server-rendered
 * with the previous day's date, then swapped on hydration.
 *
 * These run under whatever zone the test machine has, which is exactly the
 * point: the output must not depend on it.
 */

// 02:00 IST on 2026-07-30 is 20:30 UTC on 2026-07-29 — the boundary case.
const EARLY_MORNING_IST = new Date("2026-07-29T20:30:00Z");

describe("formatDayInZone", () => {
  it("dates an instant by the reader's calendar, not the runtime's", () => {
    expect(formatDayInZone(EARLY_MORNING_IST, "Asia/Kolkata")).toBe(
      "Thu 30 Jul 2026",
    );
    expect(formatDayInZone(EARLY_MORNING_IST, "UTC")).toBe("Wed 29 Jul 2026");
    expect(formatDayInZone(EARLY_MORNING_IST, "America/New_York")).toBe(
      "Wed 29 Jul 2026",
    );
  });

  it("keeps the shape the dateline had under date-fns' `EEE d MMM yyyy`", () => {
    // Single-digit day unpadded, month abbreviated, no comma — the change was
    // meant to fix the zone, not restyle the page.
    expect(formatDayInZone(new Date("2026-08-02T12:00:00Z"), "UTC")).toBe(
      "Sun 2 Aug 2026",
    );
  });
});

describe("formatDateTimeInZone", () => {
  it("reads the wall clock in the given zone", () => {
    const instant = new Date("2026-08-02T04:22:00Z");

    // The exact complaint: 09:52 IST was being shown as 4:22 AM.
    expect(formatDateTimeInZone(instant, "Asia/Kolkata")).toBe(
      "2 Aug 2026 at 9:52 AM",
    );
    expect(formatDateTimeInZone(instant, "UTC")).toBe("2 Aug 2026 at 4:22 AM");
  });

  it("handles a zone whose offset is not a whole hour", () => {
    // Kathmandu is +05:45. A formatter that rounded offsets would be an hour
    // out here and nowhere else.
    expect(
      formatDateTimeInZone(new Date("2026-08-02T04:22:00Z"), "Asia/Kathmandu"),
    ).toBe("2 Aug 2026 at 10:07 AM");
  });

  it("names midnight and noon the way a reader does", () => {
    expect(formatDateTimeInZone(new Date("2026-08-02T00:00:00Z"), "UTC")).toBe(
      "2 Aug 2026 at 12:00 AM",
    );
    expect(formatDateTimeInZone(new Date("2026-08-02T12:00:00Z"), "UTC")).toBe(
      "2 Aug 2026 at 12:00 PM",
    );
  });

  it("falls back to UTC for a zone that does not exist", () => {
    // Reached through the `tz` cookie, which is client-written and therefore
    // arbitrary. A `RangeError` out of Intl here would blank the page.
    expect(
      formatDateTimeInZone(new Date("2026-08-02T04:22:00Z"), "Mars/Olympus"),
    ).toBe("2 Aug 2026 at 4:22 AM");
  });
});
