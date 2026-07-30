import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import { createSlateEditor } from "platejs";
import { normalizeValue } from "@/lib/plate";

/**
 * Plate document → Markdown, server-side.
 *
 * `serializeMd` needs an editor instance, but `createSlateEditor` is the
 * headless (non-React) constructor, so this runs fine in a route handler or an
 * oRPC procedure — no DOM, no React renderer.
 *
 * Deliberately reuses Plate's own serializer rather than hand-rolling one: a
 * bespoke walker would be a second definition of what each node type means, free
 * to drift from the editor whenever a plugin is added.
 */
export function toMarkdown(content: unknown): string {
  const value = normalizeValue(content);

  const editor = createSlateEditor({
    plugins: [MarkdownPlugin],
    value: value as never,
  });

  return serializeMd(editor);
}

/** Filesystem-safe slug for a journal title. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "journal";
}
