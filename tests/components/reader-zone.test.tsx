import {
  ReaderZoneProvider,
  useReaderToday,
  useReaderZone,
} from "@/components/reader-zone";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reader zone on the server render.
 *
 * The calendar used to read the zone straight from `Intl` during render. On the
 * server that answers with the Node process's zone — UTC on Vercel — so the first
 * paint was cut in the wrong zone, disagreed with the server prefetch, and
 * swapped on hydration. The provider is seeded from the `tz` cookie instead, and
 * the server render must answer with that seed.
 */

// 02:00 IST on 2026-07-30, which is still 2026-07-29 in New York and in UTC.
const EARLY_MORNING_IST = new Date("2026-07-29T20:30:00Z");

/** Prints what the hook answers, so the rendered string can be asserted on. */
function Probe() {
  const { zone, formatDay } = useReaderZone();
  const today = useReaderToday();
  return <p>{`${zone}|${today}|${formatDay(EARLY_MORNING_IST)}`}</p>;
}

describe("the reader-zone provider on the server", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // A process zone that is deliberately neither the seed nor UTC, so an
    // answer that leaked from the runtime cannot pass by coincidence.
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ now: EARLY_MORNING_IST, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("renders in the seeded zone, not the Node process zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "America/New_York",
    );

    const html = renderToString(
      <ReaderZoneProvider initialZone="Asia/Kolkata">
        <Probe />
      </ReaderZoneProvider>,
    );

    expect(html).toContain("Asia/Kolkata|2026-07-30|Thu 30 Jul 2026");
  });

  it("falls back to UTC for a seed that is not a real zone", () => {
    const html = renderToString(
      <ReaderZoneProvider initialZone="Mars/Olympus_Mons">
        <Probe />
      </ReaderZoneProvider>,
    );

    expect(html).toContain("UTC|2026-07-29|Wed 29 Jul 2026");
  });

  it("does not read the clock for a subtree that only needs the zone", () => {
    // The signed-in shell mounts a provider in its layout, which is prerendered
    // into the static App Shell. Next refuses `new Date()` there: today would be
    // frozen at build time. Only components that print today may read it.
    function ZoneOnly() {
      return <p>{useReaderZone().zone}</p>;
    }
    const dateSpy = vi
      .spyOn(globalThis, "Date")
      .mockImplementation(function () {
        throw new Error("read the clock");
      });

    try {
      const html = renderToString(
        <ReaderZoneProvider initialZone="UTC">
          <ZoneOnly />
        </ReaderZoneProvider>,
      );

      expect(html).toContain("UTC");
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("refuses to answer outside a provider rather than guessing a zone", () => {
    expect(() => renderToString(<Probe />)).toThrow(/ReaderZoneProvider/);
  });
});

/**
 * Timestamps print in the reader zone, not the ambient one.
 *
 * The bug this covers: the editor's dateline and the trash table both used
 * `format()` from date-fns, which reads a `Date` through whatever zone the
 * runtime is set to — the Node process's during SSR, UTC on Vercel — so a note
 * written at 02:00 IST server-rendered with the previous day's date, then
 * swapped on hydration.
 */
describe("the reader zone's date formatting", () => {
  /** What the hook prints for `date`, rendered under a provider seeded `zone`. */
  function printed(
    zone: string,
    print: (readerZone: ReturnType<typeof useReaderZone>) => string,
  ) {
    function Print() {
      return <>{print(useReaderZone())}</>;
    }

    return renderToString(
      <ReaderZoneProvider initialZone={zone}>
        <Print />
      </ReaderZoneProvider>,
    );
  }

  const day = (zone: string, date: Date) =>
    printed(zone, ({ formatDay }) => formatDay(date));
  const dateTime = (zone: string, date: Date) =>
    printed(zone, ({ formatDateTime }) => formatDateTime(date));

  it("dates an instant by the reader's calendar", () => {
    expect(day("Asia/Kolkata", EARLY_MORNING_IST)).toBe("Thu 30 Jul 2026");
    expect(day("UTC", EARLY_MORNING_IST)).toBe("Wed 29 Jul 2026");
    expect(day("America/New_York", EARLY_MORNING_IST)).toBe("Wed 29 Jul 2026");
  });

  it("keeps the dateline's `EEE d MMM yyyy` shape", () => {
    // Single-digit day unpadded, month abbreviated, no comma.
    expect(day("UTC", new Date("2026-08-02T12:00:00Z"))).toBe("Sun 2 Aug 2026");
  });

  it("reads the wall clock in the reader zone", () => {
    const instant = new Date("2026-08-02T04:22:00Z");

    // The exact complaint: 09:52 IST was being shown as 4:22 AM.
    expect(dateTime("Asia/Kolkata", instant)).toBe("2 Aug 2026 at 9:52 AM");
    expect(dateTime("UTC", instant)).toBe("2 Aug 2026 at 4:22 AM");
  });

  it("handles a zone whose offset is not a whole hour", () => {
    // Kathmandu is +05:45. A formatter that rounded offsets would be an hour
    // out here and nowhere else.
    expect(dateTime("Asia/Kathmandu", new Date("2026-08-02T04:22:00Z"))).toBe(
      "2 Aug 2026 at 10:07 AM",
    );
  });

  it("names midnight and noon the way a reader does", () => {
    expect(dateTime("UTC", new Date("2026-08-02T00:00:00Z"))).toBe(
      "2 Aug 2026 at 12:00 AM",
    );
    expect(dateTime("UTC", new Date("2026-08-02T12:00:00Z"))).toBe(
      "2 Aug 2026 at 12:00 PM",
    );
  });

  it("prints in UTC when seeded with a zone that does not exist", () => {
    // The seed comes from the `tz` cookie, which is client-written and
    // therefore arbitrary. A `RangeError` out of Intl would blank the page.
    expect(dateTime("Mars/Olympus", new Date("2026-08-02T04:22:00Z"))).toBe(
      "2 Aug 2026 at 4:22 AM",
    );
  });
});
