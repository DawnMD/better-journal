import { describe, expect, it } from "vitest";
import {
  hasAllTags,
  MAX_TAG_FILTER,
  normalizeTagName,
  resolveTagIds,
  serializeTagIds,
} from "@/lib/tags";

/** Shaped like the cuids the ids actually are, so the guard sees realistic input. */
function fakeId(seed: string): string {
  return `c${seed}`.padEnd(25, "x").slice(0, 25);
}

describe("normalizeTagName", () => {
  it("trims, collapses whitespace and lowercases", () => {
    expect(normalizeTagName("  Deep   Work ")).toBe("deep work");
  });

  it("is idempotent, so re-normalising a stored name is a no-op", () => {
    const once = normalizeTagName("  Deep   Work ");
    expect(normalizeTagName(once)).toBe(once);
  });

  it("collapses tabs and newlines, not just spaces", () => {
    expect(normalizeTagName("deep\t\nwork")).toBe("deep work");
  });

  it("returns an empty string for whitespace-only input", () => {
    // The caller rejects this; the normaliser's job is only to report it.
    expect(normalizeTagName("   ")).toBe("");
  });
});

describe("resolveTagIds", () => {
  it("passes real ids through in order", () => {
    const first = fakeId("aaa");
    const second = fakeId("bbb");

    expect(resolveTagIds(`${first},${second}`)).toEqual([first, second]);
  });

  it("treats null, undefined and the empty string as no filter", () => {
    expect(resolveTagIds(null)).toEqual([]);
    expect(resolveTagIds(undefined)).toEqual([]);
    expect(resolveTagIds("")).toEqual([]);
  });

  it("drops empty segments left by stray commas", () => {
    const id = fakeId("aaa");
    expect(resolveTagIds(`,,${id},,`)).toEqual([id]);
  });

  it("dedupes while preserving first-seen order", () => {
    const first = fakeId("aaa");
    const second = fakeId("bbb");

    expect(resolveTagIds(`${first},${second},${first}`)).toEqual([
      first,
      second,
    ]);
  });

  it("caps the list, so a filter can never exceed what the router accepts", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      fakeId(String(index).padStart(3, "0")),
    );

    expect(resolveTagIds(many.join(","))).toHaveLength(MAX_TAG_FILTER);
  });

  it("drops anything that is not id-shaped rather than throwing", () => {
    // A hand-edited query string has to degrade to "no filter", never to a 500.
    for (const hostile of [
      "garbage",
      "__proto__",
      "constructor",
      "'; DROP TABLE \"Tag\"; --",
      "../../etc/passwd",
      "x".repeat(10_000),
      "c".repeat(41),
      "has spaces in it aaaaaaaaa",
    ]) {
      expect(resolveTagIds(hostile)).toEqual([]);
    }
  });

  it("keeps the valid ids in a partly-corrupt list", () => {
    const id = fakeId("aaa");
    expect(resolveTagIds(`__proto__,${id},!!!`)).toEqual([id]);
  });

  it("never yields a key that would poison an object used as a map", () => {
    const resolved = resolveTagIds("__proto__,constructor,prototype");
    const map: Record<string, boolean> = {};

    for (const id of resolved) map[id] = true;

    expect(Object.keys(map)).toEqual([]);
  });

  it("round-trips through serializeTagIds", () => {
    const ids = [fakeId("aaa"), fakeId("bbb")];
    expect(resolveTagIds(serializeTagIds(ids))).toEqual(ids);
  });

  it("serialises an empty selection to an empty string", () => {
    // Which is what lets the caller `params.delete("tags")` on a cleared filter.
    expect(serializeTagIds([])).toBe("");
  });
});

describe("hasAllTags", () => {
  const note = {
    tags: [{ id: "work" }, { id: "urgent" }, { id: "office" }],
  };

  it("passes everything when nothing is selected", () => {
    expect(hasAllTags({ tags: [] }, [])).toBe(true);
    expect(hasAllTags(note, [])).toBe(true);
  });

  it("requires every selected tag, not any of them", () => {
    expect(hasAllTags(note, ["work"])).toBe(true);
    expect(hasAllTags(note, ["work", "urgent"])).toBe(true);
    // AND, not OR: "work" alone is not enough once "recipes" is also selected.
    expect(hasAllTags(note, ["work", "recipes"])).toBe(false);
  });

  it("excludes an untagged note as soon as a filter is active", () => {
    expect(hasAllTags({ tags: [] }, ["work"])).toBe(false);
  });

  it("ignores extra tags the note carries beyond the selection", () => {
    expect(hasAllTags(note, ["office"])).toBe(true);
  });
});
