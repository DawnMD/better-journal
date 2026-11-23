import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseHighlightPlugin,
  BaseItalicPlugin,
  BaseStrikethroughPlugin,
  BaseUnderlinePlugin,
} from "@platejs/basic-nodes";
import { BaseParagraphPlugin } from "platejs";

/**
 * The note document schema: every node and mark type note content may contain.
 *
 * The one place a type is added or removed. The editor's plugins, the share link
 * page's static plugins and the Markdown export are all derived from it, so a
 * type the editor can write is always one the share page can render and the
 * export can serialise — and nothing else is.
 *
 * Each type maps to its headless (non-React) Plate plugin, which is what the
 * server-side Markdown export runs on. The React editor and the static renderer
 * bind their own components to the same keys; see
 * `components/editor/note-editor-plugins.tsx` and
 * `components/editor/note-static-plugins.tsx`.
 */
export const NOTE_DOCUMENT_SCHEMA = {
  blocks: {
    p: BaseParagraphPlugin,
    h1: BaseH1Plugin,
    h2: BaseH2Plugin,
    h3: BaseH3Plugin,
    blockquote: BaseBlockquotePlugin,
  },
  marks: {
    bold: BaseBoldPlugin,
    italic: BaseItalicPlugin,
    underline: BaseUnderlinePlugin,
    strikethrough: BaseStrikethroughPlugin,
    highlight: BaseHighlightPlugin,
  },
} as const;

export type NoteBlockType = keyof typeof NOTE_DOCUMENT_SCHEMA.blocks;
export type NoteMarkType = keyof typeof NOTE_DOCUMENT_SCHEMA.marks;
export type NoteNodeType = NoteBlockType | NoteMarkType;

/** The headless plugin for each type, blocks and marks together. */
export const noteDocumentPluginByType = {
  ...NOTE_DOCUMENT_SCHEMA.blocks,
  ...NOTE_DOCUMENT_SCHEMA.marks,
};

/** Every type the schema allows, blocks first. */
export const NOTE_NODE_TYPES = Object.keys(
  noteDocumentPluginByType,
) as NoteNodeType[];

/** The headless plugins, for editors that need no components. */
export const noteDocumentPlugins = Object.values(noteDocumentPluginByType);
