import { describe, expect, it } from "vitest";
import {
  dayWindow,
  monthWindow,
  yearWindow,
} from "@/server/lib/day-window";
import {
  dayKeyInTimeZone,
  monthKeyInTimeZone,
  isValidTimeZone,
  resolveTimeZone,
} from "@/lib/timezone";

const hours = (start: Date, end: Date) =>
  (end.getTime() - start.getTime()) / 3_600_000;

describe("dayWindow", () => {
  it("returns a UTC-midnight window for UTC", () => {
    const { start, end } = dayWindow("2026-07-30", "UTC");

    expect(start.toISOString()).toBe("2026-07-30T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("shifts back by the offset for a positive-offset zone (IST, +05:30)", () => {
    const { start, end } = dayWindow("2026-07-30", "Asia/Kolkata");

    // Local midnight in IST is 18:30 UTC the previous day.
    expect(start.toISOString()).toBe("2026-07-29T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-30T18:30:00.000Z");
  });

  it("shifts forward for a negative-offset zone (New York, -04:00 in July)", () => {
    const { start, end } = dayWindow("2026-07-30", "America/New_York");

    expect(start.toISOString()).toBe("2026-07-30T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T04:00:00.000Z");
  });

  it("handles a 45-minute offset (Kathmandu, +05:45)", () => {
    const { start } = dayWindow("2026-07-30", "Asia/Kathmandu");

    expect(start.toISOString()).toBe("2026-07-29T18:15:00.000Z");
  });

  it("is 23 hours long on a spring-forward DST day", () => {
    // US DST begins 2026-03-08; 02:00 local never happens.
    const { start, end } = dayWindow("2026-03-08", "America/New_York");

    expect(hours(start, end)).toBe(23);
  });

  it("is 25 hours long on a fall-back DST day", () => {
    // US DST ends 2026-11-01; 01:00 local happens twice.
    const { start, end } = dayWindow("2026-11-01", "America/New_York");

    expect(hours(start, end)).toBe(25);
  });

  it("is 24 hours long on an ordinary day", () => {
    const { start, end } = dayWindow("2026-06-15", "America/New_York");

    expect(hours(start, end)).toBe(24);
  });

  it("brackets a note written at 02:00 IST on the IST calendar day, not the UTC one", () => {
    // 02:00 IST on Jul 30 is 20:30 UTC on Jul 29. This is the exact case where
    // server-zone bucketing filed the note under the wrong day.
    const note = new Date("2026-07-29T20:30:00Z");

    const ist = dayWindow("2026-07-30", "Asia/Kolkata");
    expect(note >= ist.start && note < ist.end).toBe(true);

    const utc = dayWindow("2026-07-30", "UTC");
    expect(note >= utc.start && note < utc.end).toBe(false);

    // Under UTC it lands on the 29th — the old, wrong answer.
    const utcPrev = dayWindow("2026-07-29", "UTC");
    expect(note >= utcPrev.start && note < utcPrev.end).toBe(true);
  });

  it("is half-open, so midnight belongs to exactly one day", () => {
    const first = dayWindow("2026-07-30", "UTC");
    const second = dayWindow("2026-07-31", "UTC");

    expect(first.end.getTime()).toBe(second.start.getTime());

    const midnight = second.start;
    expect(midnight >= first.start && midnight < first.end).toBe(false);
    expect(midnight >= second.start && midnight < second.end).toBe(true);
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    const { start } = dayWindow("2026-07-30", "Mars/Olympus_Mons");

    expect(start.toISOString()).toBe("2026-07-30T00:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => dayWindow("2026-7-30", "UTC")).toThrow(/yyyy-MM-dd/);
    expect(() => dayWindow("30-07-2026", "UTC")).toThrow(/yyyy-MM-dd/);
    expect(() => dayWindow("", "UTC")).toThrow(/yyyy-MM-dd/);
  });
});

describe("monthWindow", () => {
  it("covers a whole month in the given zone", () => {
    const { start, end } = monthWindow("2026-07", "Asia/Kolkata");

    expect(start.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("handles a December-to-January rollover", () => {
    const { start, end } = monthWindow("2026-12", "UTC");

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles February in a leap year", () => {
    const { start, end } = monthWindow("2028-02", "UTC");

    expect(start.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2028-03-01T00:00:00.000Z");
    expect(hours(start, end) / 24).toBe(29);
  });

  it("rejects a malformed month", () => {
    expect(() => monthWindow("2026-7", "UTC")).toThrow(/yyyy-MM/);
    expect(() => monthWindow("2026-07-01", "UTC")).toThrow(/yyyy-MM/);
  });
});

describe("yearWindow", () => {
  it("covers a whole year in the given zone", () => {
    const { start, end } = yearWindow(2026, "Asia/Kolkata");

    expect(start.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("rejects an implausible year", () => {
    expect(() => yearWindow(26, "UTC")).toThrow(/four-digit/);
    expect(() => yearWindow(2026.5, "UTC")).toThrow(/four-digit/);
  });
});

describe("dayKeyInTimeZone", () => {
  it("labels an instant by the reader's calendar day", () => {
    const note = new Date("2026-07-29T20:30:00Z");

    expect(dayKeyInTimeZone(note, "Asia/Kolkata")).toBe("2026-07-30");
    expect(dayKeyInTimeZone(note, "UTC")).toBe("2026-07-29");
    expect(dayKeyInTimeZone(note, "America/New_York")).toBe("2026-07-29");
  });

  it("agrees with dayWindow", () => {
    const note = new Date("2026-07-29T20:30:00Z");
    const key = dayKeyInTimeZone(note, "Asia/Kolkata");
    const { start, end } = dayWindow(key, "Asia/Kolkata");

    expect(note >= start && note < end).toBe(true);
  });

  it("produces a yyyy-MM month key", () => {
    expect(
      monthKeyInTimeZone(new Date("2026-07-29T20:30:00Z"), "Asia/Kolkata"),
    ).toBe("2026-07");
  });
});

describe("resolveTimeZone", () => {
  it("passes real zones through", () => {
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
