import { describe, expect, it } from "vitest";
import { groupByMonth } from "@/lib/note-list";

describe("groupByMonth", () => {
  it("puts newest-first rows under one header per month, in list order", () => {
    const rows = [
      { id: "a", day: "2026-08-01" },
      { id: "b", day: "2026-07-31" },
      { id: "c", day: "2026-07-02" },
      { id: "d", day: "2025-12-25" },
    ];

    expect(groupByMonth(rows)).toEqual([
      { month: "2026-08", title: "August 2026", notes: [rows[0]] },
      { month: "2026-07", title: "July 2026", notes: [rows[1], rows[2]] },
      { month: "2025-12", title: "December 2025", notes: [rows[3]] },
    ]);
  });

  it("is empty for no rows", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
