/**
 * Plate document helpers.
 *
 * Plate's editor value is an array of block nodes, each with a `children` array
 * of inline nodes or text leaves. An empty document is *not* an empty array and
 * definitely not `""` — Plate needs at least one block to place the caret in, or
 * `usePlateEditor` initialises with no editable node.
 */

export const EMPTY_DOC = [{ type: "p", children: [{ text: "" }] }];

/** A fresh empty document. Returned by value so callers cannot mutate the shared constant. */
export function emptyDoc() {
  return structuredClone(EMPTY_DOC);
}

/**
 * Coerces whatever is in `Note.content` into something Plate can edit.
 *
 * `content` is `Json?`, and an earlier version of `createNote` wrote the empty
 * string. Those rows still exist, and handing `""` to `usePlateEditor({ value })`
 * produces an editor with no editable block. `prisma/seed.ts --normalize` fixes
 * the stored rows; this makes the client resilient regardless.
 */
export function normalizeValue(content: unknown) {
  if (!Array.isArray(content) || content.length === 0) return emptyDoc();
  return content;
}

type PlateNode = {
  text?: unknown;
  children?: unknown;
  type?: unknown;
};

/**
 * Flattens a Plate value to plain text by concatenating its text leaves.
 *
 * Used for the searchable `plainText` column and for word counts. Blocks are
 * joined with newlines so word counting cannot fuse the last word of one
 * paragraph with the first of the next.
 *
 * Defensive about shape: `content` is `Json?` in the schema, so historic rows
 * may hold `""`, `null`, or anything else a previous version of the app wrote.
 */
export function toPlainText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  const blocks: string[] = [];

  for (const block of content) {
    const text = collectText(block);
    // Skip blocks that flatten to nothing. Empty paragraphs are common — they
    // are how a user adds spacing — and keeping them would pad `plainText` with
    // blank lines that inflate nothing but the index and the ts_headline
    // snippets.
    if (text.trim()) blocks.push(text);
  }

  return blocks.join("\n").trim();
}

function collectText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (!isRecord(node)) return "";

  const candidate = node as PlateNode;

  if (typeof candidate.text === "string") return candidate.text;

  if (Array.isArray(candidate.children)) {
    return candidate.children.map(collectText).join("");
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Word count over the flattened text. Whitespace-delimited; good enough for a stat tile. */
export function wordCount(content: unknown): number {
  const text = toPlainText(content);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
