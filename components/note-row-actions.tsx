"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc.query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type NoteListEntry = { id: string; title: string | null; createdAt: Date };

/**
 * Per-note rename/delete menu, mirroring the journal dropdown in journal-list.
 *
 * Takes the query coordinates (`dateKey`, `month`, `timeZone`) rather than
 * reading them itself, so the cache keys it touches are exactly the ones
 * `JournalData` created — a second `clientTimeZone()` call here would be a second
 * source of truth for the key.
 */
export const NoteRowActions = ({
  noteId,
  title,
  journalId,
  dateKey,
  month,
  timeZone,
}: {
  noteId: string;
  title: string;
  journalId: string;
  dateKey: string;
  month: string;
  timeZone: string;
}) => {
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState(title);

  const listKey = orpc.notesRouter.getAllNotesByIdAndDate.queryKey({
    input: { journalId, date: dateKey, timeZone },
  });
  const countsKey = orpc.notesRouter.getNoteCountsByMonth.queryKey({
    input: { journalId, month, timeZone },
  });
  const noteKey = orpc.notesRouter.getNoteById.queryKey({ input: { noteId } });

  const { mutate: renameNote, isPending: isRenaming } = useMutation(
    orpc.notesRouter.renameNote.mutationOptions({
      onSuccess: ({ title: nextTitle }) => {
        // Optimistic in effect but applied on success: the rename round-trip is
        // fast and a failed rename that had already repainted the row would be
        // more confusing than a brief wait.
        queryClient.setQueryData(listKey, (prev: NoteListEntry[] | undefined) =>
          prev?.map((entry) =>
            entry.id === noteId ? { ...entry, title: nextTitle } : entry,
          ),
        );
        queryClient.setQueryData(noteKey, (prev) =>
          prev ? { ...prev, title: nextTitle } : prev,
        );
        toast.success("Note renamed");
        setRenameOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const { mutate: deleteNote, isPending: isDeleting } = useMutation(
    orpc.notesRouter.deleteNote.mutationOptions({
      onSuccess: () => {
        queryClient.setQueryData(listKey, (prev: NoteListEntry[] | undefined) =>
          prev?.filter((entry) => entry.id !== noteId),
        );
        // The badge count changed, so the calendar has to be refetched rather
        // than patched — we do not know which day bucket the note fell in.
        queryClient.invalidateQueries({ queryKey: countsKey });
        queryClient.removeQueries({ queryKey: noteKey });
        toast.success("Note deleted");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== title && !isRenaming;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Actions for ${title || "note"}`}
            />
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-fit" align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraft(title);
              setRenameOpen(true);
            }}
          >
            <PencilIcon />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isDeleting}
            onClick={() => deleteNote({ noteId })}
          >
            <Trash2Icon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        disablePointerDismissal={isRenaming}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename note</DialogTitle>
            <DialogDescription>
              Give this entry a title you will recognise later.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              renameNote({ noteId, title: trimmed });
            }}
          >
            <Field>
              <FieldLabel htmlFor={`rename-${noteId}`}>Title</FieldLabel>
              <Input
                id={`rename-${noteId}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoComplete="off"
                maxLength={200}
                autoFocus
              />
            </Field>
            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="outline" disabled={isRenaming}>
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" disabled={!canSubmit}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
