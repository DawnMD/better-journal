"use client";

import { BlockquoteElement } from "@/components/ui/blockquote-node";
import { H1Element, H2Element, H3Element } from "@/components/ui/heading-node";
import { HighlightLeaf } from "@/components/ui/highlight-node";
import { NOTE_NODE_TYPES, type NoteNodeType } from "@/lib/note-document";
import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HighlightPlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { type AnyPlatePlugin, ParagraphPlugin } from "platejs/react";

/**
 * The editor's React plugin for each type in the note document schema.
 *
 * A `Record` over the schema's types, so a type added to the schema does not
 * compile until the editor says how to edit it, and the editor cannot carry a
 * type the share page and export do not know about.
 */
const editorPlugins = {
  p: ParagraphPlugin,
  h1: H1Plugin.withComponent(H1Element),
  h2: H2Plugin.withComponent(H2Element),
  h3: H3Plugin.withComponent(H3Element),
  blockquote: BlockquotePlugin.withComponent(BlockquoteElement),
  bold: BoldPlugin,
  italic: ItalicPlugin,
  underline: UnderlinePlugin,
  strikethrough: StrikethroughPlugin,
  highlight: HighlightPlugin.withComponent(HighlightLeaf),
} satisfies Record<NoteNodeType, AnyPlatePlugin>;

export const noteEditorPlugins: AnyPlatePlugin[] = NOTE_NODE_TYPES.map(
  (type) => editorPlugins[type],
);
