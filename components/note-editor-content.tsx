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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import equal from "fast-deep-equal";
import { HighlighterIcon } from "lucide-react";
import { KEYS, Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

export const NotEditorContent = ({
  note,
}: {
  note: Awaited<ReturnType<typeof orpc.notesRouter.getNoteById.call>>;
}) => {
  const queryClient = useQueryClient();
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
    value: note.content as Value,
  });

  const { mutateAsync: saveNote } = useMutation(
    orpc.notesRouter.saveNote.mutationOptions({
      onSuccess(updated) {
        queryClient.setQueryData(
          orpc.notesRouter.getNoteById.queryKey({
            input: { noteId: note.id },
          }),
          updated,
        );
      },
    }),
  );

  const lastSaved = useRef<Value>(structuredClone(note.content as Value));

  const handleSave = useCallback(async () => {
    const currentValue = structuredClone(editor.children);

    if (equal(currentValue, lastSaved.current)) {
      return;
    }

    const promise = saveNote({
      noteId: note.id,
      content: currentValue,
    });

    toast.promise(promise, {
      error: "Save Failed",
      loading: "Saving...",
      success: "Saved",
    });

    const updated = await promise;

    lastSaved.current = structuredClone(updated.content as Value);
  }, [editor, saveNote, note.id]);

  const debouncedSave = useDebouncedCallback(handleSave, 1000);

  //clear debounced save
  useEffect(() => {
    return () => debouncedSave.cancel();
  }, [debouncedSave]);

  return (
    <Plate
      editor={editor}
      onValueChange={() => {
        const shouldSave = editor.operations.some(
          (op) => op.type !== "set_selection",
        );

        if (!shouldSave) return;

        debouncedSave();
      }}
    >
      <FixedToolbar className="flex justify-start gap-1 rounded-t-lg">
        <ToolbarButton onClick={() => editor.tf.h1.toggle()}>H1</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h2.toggle()}>H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.tf.h3.toggle()}>H3</ToolbarButton>
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
      </FixedToolbar>
      <EditorContainer>
        <Editor placeholder="Type your amazing content here..." />
      </EditorContainer>
    </Plate>
  );
};
