import { createNoteStaticEditor } from "@/components/editor/note-static-plugins";
import { NOTE_NODE_TYPES, type NoteNodeType } from "@/lib/note-document";
import { toMarkdown } from "@/server/lib/markdown";
import { serializeHtml } from "platejs/static";
import { describe, expect, it } from "vitest";

/**
 * One sample of every type the note document schema allows, with what the share
 * link page and the Markdown export must make of it.
 *
 * Keyed by `NoteNodeType`, so adding a type to the schema without a sample here
 * is a type error — and the "every type has a sample" case below catches it at
 * runtime too.
 */
const SAMPLES: Record<
  NoteNodeType,
  { content: unknown[]; html: string; markdown: string }
> = {
  p: {
    content: [{ type: "p", children: [{ text: "Plain words" }] }],
    html: "Plain words",
    markdown: "Plain words",
  },
  h1: {
    content: [{ type: "h1", children: [{ text: "Heading one" }] }],
    html: "<h1",
    markdown: "# Heading one",
  },
  h2: {
    content: [{ type: "h2", children: [{ text: "Heading two" }] }],
    html: "<h2",
    markdown: "## Heading two",
  },
  h3: {
    content: [{ type: "h3", children: [{ text: "Heading three" }] }],
    html: "<h3",
    markdown: "### Heading three",
  },
  blockquote: {
    content: [{ type: "blockquote", children: [{ text: "A quotation" }] }],
    html: "<blockquote",
    markdown: "> A quotation",
  },
  bold: {
    content: [{ type: "p", children: [{ text: "strong", bold: true }] }],
    html: "<strong",
    markdown: "**strong**",
  },
  italic: {
    content: [{ type: "p", children: [{ text: "leaning", italic: true }] }],
    html: "<em",
    markdown: "_leaning_",
  },
  underline: {
    content: [{ type: "p", children: [{ text: "lined", underline: true }] }],
    html: "<u",
    markdown: "<u>lined</u>",
  },
  strikethrough: {
    content: [
      { type: "p", children: [{ text: "struck", strikethrough: true }] },
    ],
    html: "<s",
    markdown: "~~struck~~",
  },
  highlight: {
    content: [{ type: "p", children: [{ text: "marked", highlight: true }] }],
    html: "<mark",
    markdown: "<mark>marked</mark>",
  },
};

async function renderShared(content: unknown) {
  return serializeHtml(createNoteStaticEditor(content));
}

describe("note document schema", () => {
  it("has a sample for every supported type", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...NOTE_NODE_TYPES].sort());
  });

  describe.each(NOTE_NODE_TYPES)("%s", (type) => {
    const sample = SAMPLES[type];

    it("renders on the share link page through its own plugin", async () => {
      const html = await renderShared(sample.content);

      // Plate tags every node it rendered through a plugin with `slate-<key>`;
      // a type with no plugin falls back to a bare div or span without it.
      expect(html).toContain(`slate-${type}`);
      expect(html).toContain(sample.html);
    });

    it("survives the Markdown export", () => {
      expect(toMarkdown(sample.content).trim()).toBe(sample.markdown);
    });
  });

  it("exports marks layered on the same words", () => {
    expect(
      toMarkdown([
        {
          type: "p",
          children: [
            { text: "all of it", underline: true, highlight: true, bold: true },
          ],
        },
      ]).trim(),
    ).toBe("**<mark><u>all of it</u></mark>**");
  });

  it("leaves ordinary prose unescaped in the export", () => {
    // Stringifying underline and highlight must not drag in MDX escaping of
    // every angle bracket and brace a journal entry happens to contain.
    expect(
      toMarkdown([
        { type: "p", children: [{ text: "1 < 2 and {braces} stay" }] },
      ]).trim(),
    ).toBe("1 < 2 and {braces} stay");
  });

  it("does not give the share link page types the editor cannot produce", async () => {
    // The share page used to carry h4–h6, code, kbd and the rest: a superset of
    // the editor. A note can only contain what the editor wrote, so anything
    // else is rendered as its bare text rather than through a plugin.
    const html = await renderShared([
      { type: "h4", children: [{ text: "Too deep", kbd: true }] },
    ]);

    expect(html).toContain("Too deep");
    expect(html).not.toContain("<h4");
    expect(html).not.toContain("<kbd");
  });
});
