import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  formatMinutes,
  packEvents,
  rangeKeys,
  resolveDayKey,
  resolveView,
  shiftAnchor,
  SLOT_MINUTES,
  viewTitle,
  visibleDays,
} from "@/lib/calendar";
import { MAX_RANGE_DAYS } from "@/server/lib/day-window";
import { format, parseISO } from "date-fns";

const day = (iso: string) => parseISO(iso);
const keys = (dates: Date[]) => dates.map((d) => format(d, "yyyy-MM-dd"));

describe("resolveView", () => {
  it("passes the three real views through", () => {
    expect(resolveView("month")).toBe("month");
    expect(resolveView("week")).toBe("week");
    expect(resolveView("day")).toBe("day");
  });

  it("falls back for anything else, since it comes from the query string", () => {
    expect(resolveView("agenda")).toBe(DEFAULT_VIEW);
    expect(resolveView("")).toBe(DEFAULT_VIEW);
    expect(resolveView(null)).toBe(DEFAULT_VIEW);
    expect(resolveView(undefined)).toBe(DEFAULT_VIEW);
    expect(resolveView("__proto__")).toBe(DEFAULT_VIEW);
  });
});

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

      expect(() => rangeKeys(parseISO(resolved), "month")).not.toThrow();
      expect(() => viewTitle(parseISO(resolved), "week")).not.toThrow();
    }
  });
});

describe("visibleDays", () => {
  it("draws six Sunday-started weeks for a month, whatever the month", () => {
    // A month can need four rows (February starting on a Sunday) or six. The
    // grid is always six so the page never grows a row as you page through it.
    for (const month of ["2026-02-01", "2026-07-15", "2027-01-31", "2028-02-29"]) {
      const days = visibleDays(day(month), "month");

      expect(days).toHaveLength(42);
      expect(days[0]!.getDay()).toBe(0);
      expect(days[41]!.getDay()).toBe(6);
    }
  });

  it("starts the month grid on the Sunday on or before the 1st", () => {
    // July 2026 opens on a Wednesday, so the grid picks up Jun 28.
    expect(keys(visibleDays(day("2026-07-15"), "month")).slice(0, 4)).toEqual([
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
    ]);
  });

  it("gives a week the Sunday–Saturday containing the anchor", () => {
    expect(keys(visibleDays(day("2026-07-30"), "week"))).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });

  it("gives a day exactly itself", () => {
    expect(keys(visibleDays(day("2026-07-30"), "day"))).toEqual(["2026-07-30"]);
  });
});

describe("rangeKeys", () => {
  it("reports the inclusive bounds of what is on screen", () => {
    expect(rangeKeys(day("2026-07-15"), "month")).toEqual({
      start: "2026-06-28",
      end: "2026-08-08",
    });
    expect(rangeKeys(day("2026-07-30"), "week")).toEqual({
      start: "2026-07-26",
      end: "2026-08-01",
    });
    expect(rangeKeys(day("2026-07-30"), "day")).toEqual({
      start: "2026-07-30",
      end: "2026-07-30",
    });
  });

  it("never asks the server for more than it will serve", () => {
    // The client and `rangeWindow` have to agree on the cap or paging to the
    // wrong month throws instead of rendering.
    for (let month = 0; month < 24; month++) {
      const anchor = new Date(2026, month, 15);
      const days = visibleDays(anchor, "month");

      expect(days.length).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    }
  });
});

describe("shiftAnchor", () => {
  it("moves by the unit the view is made of", () => {
    const anchor = day("2026-07-30");

    expect(format(shiftAnchor(anchor, "month", 1), "yyyy-MM-dd")).toBe(
      "2026-08-30",
    );
    expect(format(shiftAnchor(anchor, "week", -1), "yyyy-MM-dd")).toBe(
      "2026-07-23",
    );
    expect(format(shiftAnchor(anchor, "day", 1), "yyyy-MM-dd")).toBe(
      "2026-07-31",
    );
  });

  it("clamps a month step to the shorter month's last day", () => {
    // date-fns behaviour, asserted because the calendar depends on it: paging
    // from Jan 31 must not silently land in March.
    expect(format(shiftAnchor(day("2026-01-31"), "month", 1), "yyyy-MM-dd")).toBe(
      "2026-02-28",
    );
  });
});

describe("viewTitle", () => {
  it("names a month, a week and a day distinctly", () => {
    expect(viewTitle(day("2026-07-15"), "month")).toBe("July 2026");
    expect(viewTitle(day("2026-07-15"), "day")).toBe("Wednesday, July 15, 2026");
  });

  it("states the month once when a week sits inside one", () => {
    expect(viewTitle(day("2026-07-15"), "week")).toBe("Jul 12 – 18, 2026");
  });

  it("repeats the month when a week straddles two", () => {
    expect(viewTitle(day("2026-07-30"), "week")).toBe("Jul 26 – Aug 1, 2026");
  });
});

describe("formatMinutes", () => {
  it("renders 12-hour time with the midnight and noon edges right", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
    expect(formatMinutes(5)).toBe("12:05 AM");
    expect(formatMinutes(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinutes(12 * 60)).toBe("12:00 PM");
    expect(formatMinutes(13 * 60 + 30)).toBe("1:30 PM");
    expect(formatMinutes(23 * 60 + 59)).toBe("11:59 PM");
  });
});

describe("packEvents", () => {
  const at = (minutes: number, id = String(minutes)) => ({ id, minutes });

  it("gives a lone event the full width", () => {
    expect(packEvents([at(540)])).toEqual([
      { event: at(540), column: 0, columns: 1 },
    ]);
  });

  it("leaves well-separated events at full width", () => {
    const placed = packEvents([at(0), at(600), at(1200)]);

    expect(placed.every((entry) => entry.columns === 1)).toBe(true);
    expect(placed.map((entry) => entry.column)).toEqual([0, 0, 0]);
  });

  it("splits overlapping events into lanes", () => {
    const placed = packEvents([at(540), at(550), at(560)]);

    expect(placed.map((entry) => entry.column)).toEqual([0, 1, 2]);
    // All three report the cluster's width, so they tile the column exactly
    // rather than leaving a ragged gap where the cluster is thinnest.
    expect(placed.every((entry) => entry.columns === 3)).toBe(true);
  });

  it("reuses a lane once it has come free", () => {
    // Third event starts after the first has ended, so it goes back in lane 0.
    const placed = packEvents([at(0), at(10), at(SLOT_MINUTES)]);

    expect(placed.map((entry) => entry.column)).toEqual([0, 1, 0]);
    expect(placed.every((entry) => entry.columns === 2)).toBe(true);
  });

  it("keeps clusters independent", () => {
    const placed = packEvents([at(0), at(10), at(600), at(610), at(620)]);

    // A dense afternoon must not narrow an uncrowded morning.
    expect(placed.slice(0, 2).every((entry) => entry.columns === 2)).toBe(true);
    expect(placed.slice(2).every((entry) => entry.columns === 3)).toBe(true);
  });

  it("treats a slot as half-open, so back-to-back events do not overlap", () => {
    const placed = packEvents([at(0), at(SLOT_MINUTES)]);

    expect(placed.every((entry) => entry.columns === 1)).toBe(true);
  });

  it("sorts by time and does not mutate its input", () => {
    const input = [at(600), at(60), at(300)];
    const placed = packEvents(input);

    expect(placed.map((entry) => entry.event.minutes)).toEqual([60, 300, 600]);
    expect(input.map((event) => event.minutes)).toEqual([600, 60, 300]);
  });

  it("handles an empty day", () => {
    expect(packEvents([])).toEqual([]);
  });

  it("places every event it was given, exactly once", () => {
    const events = Array.from({ length: 50 }, (_, index) =>
      at((index * 37) % 1440, `n${index}`),
    );

    const placed = packEvents(events);

    expect(placed).toHaveLength(events.length);
    expect(new Set(placed.map((entry) => entry.event.id)).size).toBe(
      events.length,
    );
    // Every event fits inside its cluster's lane count — the invariant that
    // stops a chip rendering at a negative offset or past the column edge.
    expect(
      placed.every((entry) => entry.column >= 0 && entry.column < entry.columns),
    ).toBe(true);
  });
});
