import { ReaderZoneProvider } from "@/components/reader-zone";
import { SharedDateline } from "@/components/share/shared-dateline";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The share page's dateline, on the server render.
 *
 * A recipient following a share link reads the date in their own zone. The
 * server can only seed that zone from the `tz` cookie, so the dateline must
 * answer with the seed the page's provider was given — never the Node process
 * zone, and never a zone passed around as a prop.
 */

// 02:00 IST on 2026-07-30, which is still 2026-07-29 in New York and in UTC.
const EARLY_MORNING_IST = "2026-07-29T20:30:00.000Z";

describe("the shared note's dateline", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("dates the note on the reader's calendar day", () => {
    const html = renderToString(
      <ReaderZoneProvider initialZone="Asia/Kolkata">
        <SharedDateline createdAt={EARLY_MORNING_IST} />
      </ReaderZoneProvider>,
    );

    expect(html).toContain("Thu 30 Jul 2026");
    expect(html).toContain(`dateTime="${EARLY_MORNING_IST}"`);
  });
});
