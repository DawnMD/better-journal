import { describe, expect, it } from "vitest";
import {
  EMPTY_DOC,
  emptyDoc,
  normalizeValue,
  toPlainText,
  wordCount,
} from "@/lib/plate";

describe("emptyDoc", () => {
  it("is a real Plate document, not an empty array or a string", () => {
    // createNote used to write "", which gave usePlateEditor nothing to focus.
    expect(emptyDoc()).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("returns a fresh copy each time", () => {
    const first = emptyDoc();
    first[0].children[0].text = "mutated";

    expect(emptyDoc()[0].children[0].text).toBe("");
    expect(EMPTY_DOC[0].children[0].text).toBe("");
  });
});

describe("normalizeValue", () => {
  it("passes a real document through unchanged", () => {
    const doc = [{ type: "p", children: [{ text: "hello" }] }];
    expect(normalizeValue(doc)).toBe(doc);
  });

  it("repairs the shapes historic rows actually contain", () => {
    // Every one of these has been in the content column at some point.
    for (const bad of ["", null, undefined, [], 0, {}, "some string"]) {
      expect(normalizeValue(bad)).toEqual(emptyDoc());
    }
  });
});

describe("toPlainText", () => {
  it("joins blocks with newlines", () => {
    expect(
      toPlainText([
        { type: "p", children: [{ text: "first" }] },
        { type: "p", children: [{ text: "second" }] },
      ]),
    ).toBe("first\nsecond");
  });

  it("concatenates sibling leaves within a block without adding spaces", () => {
    // Marks split a run of text into several leaves; rejoining must not invent
    // whitespace that the user never typed.
    expect(
      toPlainText([
        {
          type: "p",
          children: [
            { text: "hello " },
            { text: "bold", bold: true },
            { text: " world" },
          ],
        },
      ]),
    ).toBe("hello bold world");
  });

  it("descends through nested inline nodes", () => {
    expect(
      toPlainText([
        {
          type: "blockquote",
          children: [{ type: "p", children: [{ text: "quoted" }] }],
        },
      ]),
    ).toBe("quoted");
  });

  it("returns empty string for anything that is not a document", () => {
    for (const bad of ["", null, undefined, 42, {}, "text"]) {
      expect(toPlainText(bad)).toBe("");
    }
  });

  it("survives malformed nodes without throwing, salvaging what text there is", () => {
    expect(
      toPlainText([
        { type: "p", children: [{ text: "ok" }] },
        { type: "p" },
        { children: null },
        null,
        "raw",
      ]),
    ).toBe("ok\nraw");
  });

  it("drops empty blocks rather than emitting blank lines", () => {
    // Empty paragraphs are how users add spacing; they should not become blank
    // lines in the search index.
    expect(
      toPlainText([
        { type: "p", children: [{ text: "first" }] },
        { type: "p", children: [{ text: "" }] },
        { type: "p", children: [{ text: "   " }] },
        { type: "p", children: [{ text: "second" }] },
      ]),
    ).toBe("first\nsecond");
  });
});

describe("wordCount", () => {
  it("counts whitespace-delimited words", () => {
    expect(
      wordCount([{ type: "p", children: [{ text: "one two three" }] }]),
    ).toBe(3);
  });

  it("does not fuse words across block boundaries", () => {
    // The reason toPlainText joins with "\n" rather than "": otherwise "end" and
    // "start" would count as one word.
    expect(
      wordCount([
        { type: "p", children: [{ text: "end" }] },
        { type: "p", children: [{ text: "start" }] },
      ]),
    ).toBe(2);
  });

  it("ignores extra whitespace and empty documents", () => {
    expect(
      wordCount([{ type: "p", children: [{ text: "  spaced   out  " }] }]),
    ).toBe(2);
    expect(wordCount(emptyDoc())).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});
