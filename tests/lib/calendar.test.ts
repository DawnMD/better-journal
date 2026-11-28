import { describe, expect, it } from "vitest";
import {
  monthTitle,
  rangeKeys,
  resolveDayKey,
  shiftMonth,
  visibleDays,
} from "@/lib/calendar";
import { MAX_RANGE_DAYS } from "@/server/lib/reader-calendar";
import { format, parseISO } from "date-fns";

const day = (iso: string) => parseISO(iso);
const keys = (dates: Date[]) => dates.map((d) => format(d, "yyyy-MM-dd"));

describe("resolveDayKey", () => {
  const TODAY = "2026-07-31";

  it("passes a real yyyy-MM-dd through", () => {
    expect(resolveDayKey("2026-07-30", TODAY)).toBe("2026-07-30");
    expect(resolveDayKey("2026-12-31", TODAY)).toBe("2026-12-31");
    // 2028 is a leap year, so this one is real.
    expect(resolveDayKey("2028-02-29", TODAY)).toBe("2028-02-29");
  });

  it("falls back when the shape is wrong", () => {
    expect(resolveDayKey("2026-7-30", TODAY)).toBe(TODAY);
    expect(resolveDayKey("30-07-2026", TODAY)).toBe(TODAY);
    expect(resolveDayKey("2026-07-30T12:00:00Z", TODAY)).toBe(TODAY);
    expect(resolveDayKey("", TODAY)).toBe(TODAY);
    expect(resolveDayKey(null, TODAY)).toBe(TODAY);
    expect(resolveDayKey(undefined, TODAY)).toBe(TODAY);
  });

  it("falls back for a well-formed date that does not exist", () => {
    // The regex cannot catch these, and every `format` downstream throws on the
    // Invalid Date they parse to — a 500 for a mistyped link.
    expect(resolveDayKey("2026-02-31", TODAY)).toBe(TODAY);
    expect(resolveDayKey("2026-13-01", TODAY)).toBe(TODAY);
    expect(resolveDayKey("2026-00-10", TODAY)).toBe(TODAY);
    // Not a leap year, so the 29th is one of these too.
    expect(resolveDayKey("2026-02-29", TODAY)).toBe(TODAY);
  });

  it("returns something every downstream caller can format", () => {
    for (const input of ["2026-02-31", "nonsense", "", "2026-07-30"]) {
      const resolved = resolveDayKey(input, TODAY);

      expect(() => rangeKeys(parseISO(resolved))).not.toThrow();
      expect(() => monthTitle(parseISO(resolved))).not.toThrow();
    }
  });
});

describe("visibleDays", () => {
  it("draws six Sunday-started weeks for a month, whatever the month", () => {
    // A month can need four rows (February starting on a Sunday) or six. The
    // grid is always six so the page never grows a row as you page through it.
    for (const month of ["2026-02-01", "2026-07-15", "2027-01-31", "2028-02-29"]) {
      const days = visibleDays(day(month));

      expect(days).toHaveLength(42);
      expect(days[0]!.getDay()).toBe(0);
      expect(days[41]!.getDay()).toBe(6);
    }
  });

  it("starts the month grid on the Sunday on or before the 1st", () => {
    // July 2026 opens on a Wednesday, so the grid picks up Jun 28.
    expect(keys(visibleDays(day("2026-07-15"))).slice(0, 4)).toEqual([
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
    ]);
  });
});

describe("rangeKeys", () => {
  it("reports the inclusive bounds of the month grid", () => {
    expect(rangeKeys(day("2026-07-15"))).toEqual({
      start: "2026-06-28",
      end: "2026-08-08",
    });
  });

  it("never asks the server for more than it will serve", () => {
    // The client and `rangeWindow` have to agree on the cap or paging to the
    // wrong month throws instead of rendering.
    for (let month = 0; month < 24; month++) {
      const anchor = new Date(2026, month, 15);

      expect(visibleDays(anchor).length).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    }
  });
});

describe("shiftMonth", () => {
  it("moves a month at a time", () => {
    expect(format(shiftMonth(day("2026-07-30"), 1), "yyyy-MM-dd")).toBe(
      "2026-08-30",
    );
    expect(format(shiftMonth(day("2026-07-30"), -1), "yyyy-MM-dd")).toBe(
      "2026-06-30",
    );
  });

  it("clamps to the shorter month's last day", () => {
    // date-fns behaviour, asserted because the calendar depends on it: paging
    // from Jan 31 must not silently land in March.
    expect(format(shiftMonth(day("2026-01-31"), 1), "yyyy-MM-dd")).toBe(
      "2026-02-28",
    );
  });
});

describe("monthTitle", () => {
  it("names the month", () => {
    expect(monthTitle(day("2026-07-15"))).toBe("July 2026");
  });
});
