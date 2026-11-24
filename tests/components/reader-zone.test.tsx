import { ReaderZoneProvider, useReaderZone } from "@/components/reader-zone";
import { clientTimeZone } from "@/lib/timezone";
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
  const { zone, today, formatDay } = useReaderZone();
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
    expect(clientTimeZone()).toBe("America/New_York");

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

  it("refuses to answer outside a provider rather than guessing a zone", () => {
    expect(() => renderToString(<Probe />)).toThrow(/ReaderZoneProvider/);
  });
});
