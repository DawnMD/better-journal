"use client";

import { NoteTitle } from "@/components/note-title";
import {
  clearSaveStatus,
  setSaveStatus,
} from "@/components/shell/save-status";
import { NoteTags } from "@/components/tags/note-tags";
import { BlockquoteElement } from "@/components/ui/blockquote-node";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { H1Element, H2Element, H3Element } from "@/components/ui/heading-node";
import { HighlightLeaf } from "@/components/ui/highlight-node";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { ToolbarButton } from "@/components/ui/toolbar";
import { orpc } from "@/lib/orpc.query";
import { normalizeValue } from "@/lib/plate";
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
import { format } from "date-fns";
import { KEYS, Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

/**
 * Words in a Plate document, for the line above the title.
 *
 * Walks the node tree rather than serialising to text first: the document is
 * small, this runs once per render of a component that only re-renders when the
 * note changes, and a full serialise would allocate the whole body as a string to
 * then throw away.
 */
function countWords(nodes: unknown): number {
  if (typeof nodes !== "object" || nodes === null) return 0;

  if (Array.isArray(nodes)) {
    return nodes.reduce<number>((sum, node) => sum + countWords(node), 0);
  }

  const node = nodes as { text?: unknown; children?: unknown };

  if (typeof node.text === "string") {
    const trimmed = node.text.trim();
    return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  }

  return countWords(node.children);
}

export const NoteEditorContent = ({
  note,
}: {
  note: Awaited<ReturnType<typeof orpc.notesRouter.getNoteById.call>>;
}) => {
  const queryClient = useQueryClient();

  // Historic rows may hold "" rather than a Plate document; normalizeValue turns
  // those into a real empty paragraph so the editor has something to focus.
  const initialValue = normalizeValue(note.content) as Value;

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
    value: initialValue,
  });

  const { mutateAsync: saveNote } = useMutation(
    orpc.notesRouter.saveNote.mutationOptions({
      onSuccess(updated) {
        // Patch only the field that changed. saveNote used to return the joined
        // journal row, and writing that whole object here overwrote the
        // getNoteById cache entry with a different shape.
        queryClient.setQueryData(
          orpc.notesRouter.getNoteById.queryKey({
            input: { noteId: note.id },
          }),
          (prev) => (prev ? { ...prev, content: updated.content } : prev),
        );
      },
    }),
  );

  const lastSaved = useRef<Value>(structuredClone(initialValue));

  // Kept alongside the value so "Saving…" can still show when the last save was,
  // instead of blanking the timestamp for the length of every round trip.
  const lastSavedAt = useRef<number | null>(null);

  const handleSave = useCallback(async () => {
    const currentValue = structuredClone(editor.children);

    if (equal(currentValue, lastSaved.current)) {
      return;
    }

    // Previously a `toast.promise` per save: "Saving…" then "Saved", every time
    // the 1s debounce fired. On the one screen whose job is to disappear while
    // you write, that is a notification every few seconds reporting that the
    // software works. The state now goes to the top bar's SaveIndicator, and the
    // toast is kept for the one case worth interrupting a sentence over.
    setSaveStatus({ state: "saving", savedAt: lastSavedAt.current });

    try {
      const updated = await saveNote({
        noteId: note.id,
        content: currentValue,
      });

      lastSaved.current = structuredClone(updated.content as Value);
      lastSavedAt.current = Date.now();

      setSaveStatus({ state: "saved", savedAt: lastSavedAt.current });
    } catch (error) {
      setSaveStatus({ state: "error", savedAt: lastSavedAt.current });
      toast.error("Couldn't save this entry", {
        description:
          error instanceof Error
            ? error.message
            : "Your text is still here — check your connection and keep typing.",
      });
    }
  }, [editor, saveNote, note.id]);

  const debouncedSave = useDebouncedCallback(handleSave, 1000);

  //clear debounced save
  useEffect(() => {
    return () => debouncedSave.cancel();
  }, [debouncedSave]);

  // The indicator lives in the layout, which outlives this component, so leaving
  // a note has to take "Saved · 2m ago" with it rather than stranding it over
  // whatever page comes next.
  useEffect(() => clearSaveStatus, []);

  // Held in state and refreshed on its own debounce rather than read from
  // `editor.children` at render time: Plate does not re-render this component
  // when the document changes, so a value computed here would freeze at whatever
  // it was on mount. 500ms is slower than the eye but far faster than the save,
  // so the count settles while you are still on the same paragraph — and typing
  // costs one re-render per pause rather than one per keystroke.
  const [words, setWords] = useState(() => countWords(initialValue));

  const debouncedCount = useDebouncedCallback(
    () => setWords(countWords(editor.children)),
    500,
  );

  useEffect(() => {
    return () => debouncedCount.cancel();
  }, [debouncedCount]);

  return (
    <div className="w-full">
      {/* The dateline. Mono, uppercase and tracked, sitting above the title the
          way a masthead sits above a piece: it is metadata about the entry, not
          part of it, and setting it in the same serif as the title would make it
          compete with one. */}
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
        <time dateTime={new Date(note.createdAt).toISOString()}>
          {format(note.createdAt, "EEE d MMM yyyy")}
        </time>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
      </div>

      <NoteTitle noteId={note.id} title={note.title ?? ""} />
      {/* Above the Plate surface rather than inside it: the combobox opens a
          popover, and a popover mounted within the editor would fight Plate for
          the selection every time it took focus. */}
      <NoteTags noteId={note.id} />
      <Plate
        editor={editor}
        onValueChange={() => {
          const shouldSave = editor.operations.some(
            (op) => op.type !== "set_selection",
          );

          if (!shouldSave) return;

          debouncedSave();
          debouncedCount();
        }}
      >
        {/* The toolbar and the writing surface share one hover/focus group so the
            controls can recede while the surface is idle.

            The fade is on an inner row, not on FixedToolbar itself: the toolbar is
            sticky, so its background is what stops the prose scrolling visibly
            underneath it, and fading the element would fade that background too.
            `top-14` parks it under the app's own sticky bar rather than beneath it.

            Still a fixed toolbar rather than a floating selection one — that would
            mean taking over Plate's selection handling, which is a great deal more
            risk for the same quiet. */}
        <div className="group/surface">
          <FixedToolbar className="top-14 justify-start rounded-none border-b-0 p-0">
            <div className="flex items-center gap-1 py-1 opacity-40 transition-opacity duration-200 group-focus-within/surface:opacity-100 group-hover/surface:opacity-100">
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
            </div>
          </FixedToolbar>
          <EditorContainer>
            <Editor
              variant="journal"
              placeholder="Start writing. Nobody else is reading."
            />
          </EditorContainer>
        </div>
      </Plate>
    </div>
  );
};
