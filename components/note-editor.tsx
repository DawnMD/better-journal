"use client";

import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { NoteEditorContent } from "./note-editor-content";

export const NoteEditor = ({ noteId }: { noteId: string }) => {
  // No isError branch: useSuspenseQuery throws on failure, which the
  // [noteId]/error.tsx boundary renders.
  const { data } = useSuspenseQuery(
    orpc.notesRouter.getNoteById.queryOptions({
      input: {
        noteId,
      },
    }),
  );

  // Keyed by note id so switching notes remounts the editor rather than trying
  // to swap Plate's initial value underneath it.
  return <NoteEditorContent key={data.id} note={data} />;
};
