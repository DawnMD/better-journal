import { noteDocumentPlugins } from "@/lib/note-document";
import { normalizeValue } from "@/lib/plate";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import { createSlateEditor } from "platejs";

/**
 * Plate document → Markdown, server-side.
 *
 * `serializeMd` needs an editor instance, but `createSlateEditor` is the
 * headless (non-React) constructor, so this runs fine in a route handler or an
 * oRPC procedure — no DOM, no React renderer.
 *
 * Deliberately reuses Plate's own serializer rather than hand-rolling one: a
 * bespoke walker would be a second definition of what each node type means, free
 * to drift from the editor whenever a plugin is added. The editor runs the note
 * document schema's plugins, so it knows exactly the types a note can contain.
 */
export function toMarkdown(content: unknown): string {
  const value = normalizeValue(content);

  const editor = createSlateEditor({
    plugins: [
      ...noteDocumentPlugins,
      MarkdownPlugin.configure({
        options: { remarkStringifyOptions: { handlers: markHandlers } },
      }),
    ],
    value: value as never,
  });

  return serializeMd(editor);
}

/** `remark-stringify`'s node handlers, as `serializeMd` accepts them. */
type StringifyHandlers = NonNullable<
  NonNullable<
    NonNullable<Parameters<typeof serializeMd>[1]>["remarkStringifyOptions"]
  >["handlers"]
>;

/**
 * Stringifiers for the marks plain CommonMark has no syntax for.
 *
 * Plate's serializer emits strikethrough as a GFM `delete` node and underline
 * and highlight as inline JSX (`<u>`, `<mark>`), expecting `remark-gfm` and
 * `remark-mdx` to stringify them. Without those, `remark-stringify` throws on
 * the first such mark and the whole export fails. Handling only these three node
 * types, rather than adding both extensions, leaves every other character of the
 * output exactly as before — `remark-mdx` would start escaping every `<` and `{`
 * in ordinary prose.
 */
const markHandlers: StringifyHandlers = {
  delete(node, _parent, state, info) {
    return wrapPhrasing(node, state, info, "~~", "~~");
  },
  mdxJsxTextElement(node, _parent, state, info) {
    return wrapPhrasing(node, state, info, `<${node.name}>`, `</${node.name}>`);
  },
};

type Handle = NonNullable<StringifyHandlers["delete"]>;

/** `open` + the node's phrasing children + `close`, keeping column tracking. */
function wrapPhrasing(
  node: Parameters<Handle>[0],
  state: Parameters<Handle>[2],
  info: Parameters<Handle>[3],
  open: string,
  close: string,
) {
  const tracker = state.createTracker(info);
  let value = tracker.move(open);

  value += tracker.move(
    state.containerPhrasing(node, {
      ...tracker.current(),
      before: value,
      after: close.charAt(0),
    }),
  );

  return value + tracker.move(close);
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
