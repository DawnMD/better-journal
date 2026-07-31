import { describe, expect, it } from "vitest";
import {
  TAG_COLOR_COUNT,
  tagColorClasses,
  tagColorIndex,
  tagDotClasses,
} from "@/lib/tag-color";
import { normalizeTagName } from "@/lib/tags";

describe("tagColorIndex", () => {
  /**
   * Pinned by running the hash, not by hand.
   *
   * The point is not that these particular numbers are correct — any assignment
   * would be — but that they cannot change silently. A tag's colour is part of
   * how the user recognises it, so a different hash function, a different
   * palette length, or a stray change to the normaliser has to show up as a
   * deliberate diff in this list rather than as every tag quietly recolouring.
   */
  const PINNED: Record<string, number> = {
    work: 0,
    travel: 1,
    ideas: 3,
    recipes: 4,
    personal: 5,
    health: 7,
  };

  it("assigns the pinned index to each known name", () => {
    for (const [name, index] of Object.entries(PINNED)) {
      expect(tagColorIndex(name)).toBe(index);
    }
  });

  it("is stable across calls", () => {
    expect(tagColorIndex("work")).toBe(tagColorIndex("work"));
  });

  it("stays inside the palette for a large spread of names", () => {
    for (let index = 0; index < 1000; index++) {
      const value = tagColorIndex(`tag-${index}-${index * 7919}`);

      expect(Number.isInteger(value)).toBe(true);
      // `>>> 0` before the modulo is what rules out a negative index here.
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(TAG_COLOR_COUNT);
    }
  });

  it("uses more than one hue across those names", () => {
    // A hash that collapsed everything to one colour would pass every bound
    // check above and still be useless.
    const seen = new Set(
      Array.from({ length: 1000 }, (_, index) => tagColorIndex(`tag-${index}`)),
    );

    expect(seen.size).toBe(TAG_COLOR_COUNT);
  });

  it("does not throw on an empty name", () => {
    // Unreachable through the router, which rejects empty names — but this is a
    // pure function and a render must not be able to crash on one.
    expect(() => tagColorIndex("")).not.toThrow();
    expect(tagColorIndex("")).toBeLessThan(TAG_COLOR_COUNT);
  });

  it("ignores case and surrounding whitespace", () => {
    // "Work" and "work" are one row in the database, so they must be one colour.
    expect(tagColorIndex("  Deep   Work ")).toBe(tagColorIndex("deep work"));
    expect(tagColorIndex("WORK")).toBe(tagColorIndex("work"));
  });

  it("agrees with normalizeTagName about what the same name is", () => {
    const raw = "  Deep   Work ";
    expect(tagColorIndex(raw)).toBe(tagColorIndex(normalizeTagName(raw)));
  });

  it("survives astral-plane characters", () => {
    expect(() => tagColorIndex("🎉 party 🎉")).not.toThrow();
    expect(tagColorIndex("🎉 party 🎉")).toBeLessThan(TAG_COLOR_COUNT);
  });
});

describe("the palette itself", () => {
  /** Every distinct class string the two helpers can return. */
  const chipClasses = new Set<string>();
  const dotClasses = new Set<string>();

  for (let index = 0; index < 2000; index++) {
    chipClasses.add(tagColorClasses(`tag-${index}`));
    dotClasses.add(tagDotClasses(`tag-${index}`));
  }

  it("exposes exactly one chip and one dot class string per hue", () => {
    expect(chipClasses.size).toBe(TAG_COLOR_COUNT);
    expect(dotClasses.size).toBe(TAG_COLOR_COUNT);
  });

  it("gives every chip a dark-mode text colour", () => {
    // Asserted mechanically rather than eyeballed: the fill is one hue at low
    // alpha and works on either surface, but the text lightness has to swap, and
    // a hue added later without a `dark:` variant would be unreadable in dark
    // mode only — which is exactly the kind of thing nobody notices.
    for (const classes of chipClasses) {
      expect(classes).toContain("dark:text-");
    }
  });

  it("gives every chip a border, a fill and a light-mode text colour", () => {
    for (const classes of chipClasses) {
      expect(classes).toMatch(/\bborder-[a-z]+-\d{3}\/\d+\b/);
      expect(classes).toMatch(/\bbg-[a-z]+-\d{3}\/\d+\b/);
      expect(classes).toMatch(/(^|\s)text-[a-z]+-\d{3}\b/);
    }
  });

  it("writes every class out in full, so Tailwind's scanner can see it", () => {
    // An interpolated `bg-${hue}-500/10` would generate no CSS at all.
    for (const classes of [...chipClasses, ...dotClasses]) {
      expect(classes).not.toContain("${");
      expect(classes).not.toContain("undefined");
    }
  });
});
