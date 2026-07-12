"use client";

import { BlockquoteElement } from "@/components/ui/blockquote-node";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { H1Element, H2Element, H3Element } from "@/components/ui/heading-node";
import { HighlightLeaf } from "@/components/ui/highlight-node";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { ToolbarButton } from "@/components/ui/toolbar";
import { orpc } from "@/lib/orpc.query";
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
import { useSuspenseQuery } from "@tanstack/react-query";
import { HighlighterIcon } from "lucide-react";
import { KEYS, Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

const initialValue: Value = [
  {
    type: "p",
    children: [
      { text: "Hello! Try out the " },
      { text: "bold", bold: true },
      { text: ", " },
      { text: "italic", italic: true },
      { text: ", and " },
      { text: "underline", underline: true },
      { text: " formatting." },
    ],
  },
];
export const NoteEditior = ({ noteId }: { noteId: string }) => {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      HighlightPlugin,
      StrikethroughPlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
      HighlightPlugin.withComponent(HighlightLeaf),
    ],
    value: () => {
      return initialValue;
    },
  });

  const { data, isError } = useSuspenseQuery(
    orpc.notesRouter.getNoteById.queryOptions({
      input: {
        noteId,
      },
    }),
  );

  if (isError) {
    return <div>Something went wrong</div>;
  }

  return (
    <div>
      <Plate editor={editor}>
        <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
          <ToolbarButton onClick={() => editor.tf.h1.toggle()}>
            H1
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.tf.h2.toggle()}>
            H2
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.tf.h3.toggle()}>
            H3
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.tf.blockquote.toggle()}>
            Quote
          </ToolbarButton>
          <MarkToolbarButton nodeType={KEYS.highlight} tooltip="Highlight">
            <HighlighterIcon />
          </MarkToolbarButton>
          <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">
            B
          </MarkToolbarButton>
          <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">
            I
          </MarkToolbarButton>
          <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">
            U
          </MarkToolbarButton>
          <div className="flex-1" />
          <ToolbarButton
            className="px-2"
            onClick={() => editor.tf.setValue(initialValue)}
          >
            Reset
          </ToolbarButton>
        </FixedToolbar>
        <EditorContainer>
          <Editor placeholder="Type your amazing content here..." />
        </EditorContainer>
      </Plate>
    </div>
  );
};
