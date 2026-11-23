import { BlockquoteElementStatic } from "@/components/ui/blockquote-node-static";
import {
  H1ElementStatic,
  H2ElementStatic,
  H3ElementStatic,
} from "@/components/ui/heading-node-static";
import { HighlightLeafStatic } from "@/components/ui/highlight-node-static";
import { ParagraphElementStatic } from "@/components/ui/paragraph-node-static";
import {
  NOTE_NODE_TYPES,
  noteDocumentPluginByType,
  type NoteNodeType,
} from "@/lib/note-document";
import { normalizeValue } from "@/lib/plate";
import { createSlateEditor, type NodeComponent } from "platejs";

/**
 * Static components for the share link page. A type without one renders through
 * its plugin's default element (`<strong>`, `<em>`, …).
 */
const staticComponents: Partial<Record<NoteNodeType, NodeComponent>> = {
  p: ParagraphElementStatic,
  h1: H1ElementStatic,
  h2: H2ElementStatic,
  h3: H3ElementStatic,
  blockquote: BlockquoteElementStatic,
  highlight: HighlightLeafStatic,
};

/**
 * The read-only twin of the editor's plugins: one per type in the note document
 * schema, bound to the `*Static` components instead of the React ones.
 */
export const noteStaticPlugins = NOTE_NODE_TYPES.map((type) => {
  const component = staticComponents[type];
  const plugin = noteDocumentPluginByType[type];

  return component ? plugin.withComponent(component) : plugin;
});

/**
 * A headless editor holding one note's content, ready for `PlateStatic`. Built
 * per render because it carries the note's value.
 */
export function createNoteStaticEditor(content: unknown) {
  return createSlateEditor({
    plugins: noteStaticPlugins,
    value: normalizeValue(content) as never,
  });
}
