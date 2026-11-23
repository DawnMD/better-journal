import { describe, expect, it } from "vitest";
import {
  MAX_RANGE_DAYS,
  readerCalendar,
  readerZoneInput,
} from "@/server/lib/reader-calendar";
import {
  isValidTimeZone,
  monthKeyInTimeZone,
  resolveTimeZone,
} from "@/lib/timezone";

const hours = (start: Date, end: Date) =>
  (end.getTime() - start.getTime()) / 3_600_000;

const utc = readerCalendar("UTC");
const ist = readerCalendar("Asia/Kolkata");
const newYork = readerCalendar("America/New_York");

describe("readerCalendar", () => {
  it("keeps a real reader zone", () => {
    expect(ist.zone).toBe("Asia/Kolkata");
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    const junk = readerCalendar("Mars/Olympus_Mons");

    expect(junk.zone).toBe("UTC");
    expect(junk.dayWindow("2026-07-30").start.toISOString()).toBe(
      "2026-07-30T00:00:00.000Z",
    );
    expect(junk.dayAndMinutesOf(new Date("2026-07-30T09:05:00Z"))).toEqual({
      day: "2026-07-30",
      minutes: 9 * 60 + 5,
    });
  });
});

describe("readerZoneInput", () => {
  it("parses the reader zone procedure input into a reader calendar", () => {
    expect(readerZoneInput.parse("Asia/Kolkata").zone).toBe("Asia/Kolkata");
  });

  it("reads a missing or hostile zone as UTC", () => {
    expect(readerZoneInput.parse(undefined).zone).toBe("UTC");
    expect(readerZoneInput.parse("'; DROP TABLE \"Note\"; --").zone).toBe(
      "UTC",
    );
  });
});

describe("dayWindow", () => {
  it("returns a UTC-midnight window for UTC", () => {
    const { start, end } = utc.dayWindow("2026-07-30");

    expect(start.toISOString()).toBe("2026-07-30T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("shifts back by the offset for a positive-offset zone (IST, +05:30)", () => {
    const { start, end } = ist.dayWindow("2026-07-30");

    // Local midnight in IST is 18:30 UTC the previous day.
    expect(start.toISOString()).toBe("2026-07-29T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-30T18:30:00.000Z");
  });

  it("shifts forward for a negative-offset zone (New York, -04:00 in July)", () => {
    const { start, end } = newYork.dayWindow("2026-07-30");

    expect(start.toISOString()).toBe("2026-07-30T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T04:00:00.000Z");
  });

  it("handles a 45-minute offset (Kathmandu, +05:45)", () => {
    const { start } = readerCalendar("Asia/Kathmandu").dayWindow("2026-07-30");

    expect(start.toISOString()).toBe("2026-07-29T18:15:00.000Z");
  });

  it("is 23 hours long on a spring-forward DST day", () => {
    // US DST begins 2026-03-08; 02:00 local never happens.
    const { start, end } = newYork.dayWindow("2026-03-08");

    expect(hours(start, end)).toBe(23);
  });

  it("is 25 hours long on a fall-back DST day", () => {
    // US DST ends 2026-11-01; 01:00 local happens twice.
    const { start, end } = newYork.dayWindow("2026-11-01");

    expect(hours(start, end)).toBe(25);
  });

  it("is 24 hours long on an ordinary day", () => {
    const { start, end } = newYork.dayWindow("2026-06-15");

    expect(hours(start, end)).toBe(24);
  });

  it("brackets a note written at 02:00 IST on the IST calendar day, not the UTC one", () => {
    // 02:00 IST on Jul 30 is 20:30 UTC on Jul 29. This is the exact case where
    // server-zone bucketing filed the note under the wrong day.
    const note = new Date("2026-07-29T20:30:00Z");

    const istDay = ist.dayWindow("2026-07-30");
    expect(note >= istDay.start && note < istDay.end).toBe(true);

    const utcDay = utc.dayWindow("2026-07-30");
    expect(note >= utcDay.start && note < utcDay.end).toBe(false);

    // Under UTC it lands on the 29th — the old, wrong answer.
    const utcPrev = utc.dayWindow("2026-07-29");
    expect(note >= utcPrev.start && note < utcPrev.end).toBe(true);
  });

  it("is half-open, so midnight belongs to exactly one day", () => {
    const first = utc.dayWindow("2026-07-30");
    const second = utc.dayWindow("2026-07-31");

    expect(first.end.getTime()).toBe(second.start.getTime());

    const midnight = second.start;
    expect(midnight >= first.start && midnight < first.end).toBe(false);
    expect(midnight >= second.start && midnight < second.end).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(() => utc.dayWindow("2026-7-30")).toThrow(/yyyy-MM-dd/);
    expect(() => utc.dayWindow("30-07-2026")).toThrow(/yyyy-MM-dd/);
    expect(() => utc.dayWindow("")).toThrow(/yyyy-MM-dd/);
  });
});

describe("rangeWindow", () => {
  it("is inclusive of both named days", () => {
    const { start, end } = utc.rangeWindow("2026-06-28", "2026-08-08");

    expect(start.toISOString()).toBe("2026-06-28T00:00:00.000Z");
    // Aug 8 is *in* the range, so the window runs to the midnight after it.
    expect(end.toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });

  it("covers a single day when both ends are the same", () => {
    const { start, end } = utc.rangeWindow("2026-07-30", "2026-07-30");
    const day = utc.dayWindow("2026-07-30");

    expect(start.toISOString()).toBe(day.start.toISOString());
    expect(end.toISOString()).toBe(day.end.toISOString());
  });

  it("cuts its bounds in the reader's zone, not the server's", () => {
    const { start, end } = ist.rangeWindow("2026-07-01", "2026-07-07");

    expect(start.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-07T18:30:00.000Z");
  });

  it("handles a December-to-January rollover", () => {
    const { start, end } = utc.rangeWindow("2026-12-27", "2027-01-02");

    expect(start.toISOString()).toBe("2026-12-27T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-03T00:00:00.000Z");
  });

  it("accepts a full six-week month grid", () => {
    // 42 days inclusive — the widest grid the calendar draws, and exactly the cap.
    const { start, end } = utc.rangeWindow("2026-06-28", "2026-08-08");

    expect(hours(start, end) / 24).toBe(MAX_RANGE_DAYS);
  });

  it("accepts a six-week grid that crosses a DST transition", () => {
    // The regression a naive hour comparison would cause: US DST ends
    // 2026-11-01, so this span is 42 days plus one hour, and a floor-to-days
    // check that measured 42.04 would reject a grid it accepts in July.
    expect(() => newYork.rangeWindow("2026-10-25", "2026-12-05")).not.toThrow();

    expect(() => newYork.rangeWindow("2026-03-01", "2026-04-11")).not.toThrow();
  });

  it("refuses a span wider than the grid, so one call cannot drain a journal", () => {
    expect(() => utc.rangeWindow("2026-01-01", "2026-12-31")).toThrow(
      /over the 42-day limit/,
    );
    expect(() => utc.rangeWindow("2026-06-28", "2026-08-09")).toThrow(
      /43 days/,
    );
  });

  it("refuses a backwards range", () => {
    expect(() => utc.rangeWindow("2026-07-30", "2026-07-29")).toThrow(
      /ends before it starts/,
    );
  });

  it("rejects malformed bounds", () => {
    expect(() => utc.rangeWindow("2026-7-01", "2026-07-30")).toThrow(
      /yyyy-MM-dd/,
    );
    expect(() => utc.rangeWindow("2026-07-01", "")).toThrow(/yyyy-MM-dd/);
  });
});

describe("yearWindow", () => {
  it("covers a whole year in the reader zone", () => {
    const { start, end } = ist.yearWindow(2026);

    expect(start.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("rejects an implausible year", () => {
    expect(() => utc.yearWindow(26)).toThrow(/four-digit/);
    expect(() => utc.yearWindow(2026.5)).toThrow(/four-digit/);
  });
});

describe("dayOf", () => {
  it("names the reader's calendar day an instant falls on", () => {
    const note = new Date("2026-07-29T20:30:00Z");

    expect(ist.dayOf(note)).toBe("2026-07-30");
    expect(utc.dayOf(note)).toBe("2026-07-29");
    expect(newYork.dayOf(note)).toBe("2026-07-29");
  });

  it("lands inside the day window it names", () => {
    const note = new Date("2026-07-29T20:30:00Z");
    const { start, end } = ist.dayWindow(ist.dayOf(note));

    expect(note >= start && note < end).toBe(true);
  });
});

describe("dayAndMinutesOf", () => {
  it("agrees with dayOf about the day", () => {
    const note = new Date("2026-07-29T20:30:00Z");

    for (const calendar of [utc, ist, newYork]) {
      expect(calendar.dayAndMinutesOf(note).day).toBe(calendar.dayOf(note));
    }
  });

  it("reports minutes past local midnight, in the reader zone", () => {
    const note = new Date("2026-07-29T20:30:00Z");

    // 02:00 IST — the case the whole timezone layer exists for.
    expect(ist.dayAndMinutesOf(note)).toEqual({
      day: "2026-07-30",
      minutes: 2 * 60,
    });
    expect(utc.dayAndMinutesOf(note)).toEqual({
      day: "2026-07-29",
      minutes: 20 * 60 + 30,
    });
  });

  it("places local midnight at 0, not 1440", () => {
    // The `hour12: false` trap: some ICU builds render midnight as hour "24",
    // which would push a 00:15 note off the bottom of the previous day.
    expect(utc.dayAndMinutesOf(new Date("2026-07-30T00:00:00Z"))).toEqual({
      day: "2026-07-30",
      minutes: 0,
    });
    expect(utc.dayAndMinutesOf(new Date("2026-07-30T00:15:00Z")).minutes).toBe(
      15,
    );
  });

  it("handles a 45-minute offset", () => {
    expect(
      readerCalendar("Asia/Kathmandu").dayAndMinutesOf(
        new Date("2026-07-30T00:00:00Z"),
      ),
    ).toEqual({ day: "2026-07-30", minutes: 5 * 60 + 45 });
  });

  it("lands inside the day window it names", () => {
    const note = new Date("2026-11-01T05:30:00Z");
    const { day, minutes } = newYork.dayAndMinutesOf(note);
    const { start, end } = newYork.dayWindow(day);

    expect(note >= start && note < end).toBe(true);
    // Placed within the day's own length, which on this fall-back day is 25h.
    expect(minutes).toBeLessThan(24 * 60);
  });
});

describe("today", () => {
  it("is the reader's calendar day at the given instant", () => {
    // 20:30 UTC on Jul 29 is already Jul 30 in IST.
    const now = new Date("2026-07-29T20:30:00Z");

    expect(ist.today(now)).toBe("2026-07-30");
    expect(utc.today(now)).toBe("2026-07-29");
  });

  it("defaults to the current instant", () => {
    expect(utc.today()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("shared core", () => {
  it("produces a yyyy-MM month key", () => {
    expect(
      monthKeyInTimeZone(new Date("2026-07-29T20:30:00Z"), "Asia/Kolkata"),
    ).toBe("2026-07");
  });

  it("passes real zones through resolveTimeZone", () => {
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveTimeZone("UTC")).toBe("UTC");
  });

  it("falls back to UTC for junk, empty, and missing input", () => {
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    // The kind of thing that arrives from a hostile client.
    expect(resolveTimeZone("'; DROP TABLE \"Note\"; --")).toBe("UTC");
  });

  it("recognises valid zones", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
