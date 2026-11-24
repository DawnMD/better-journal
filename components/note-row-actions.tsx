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
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Per-note rename/delete menu, mirroring the journal dropdown in journal-list.
 *
 * Only toasts and closes its dialog: the cache effects of a rename or delete
 * (every cached calendar range, the note, search, stats) are applied centrally
 * from lib/query/cache-effects.ts, so this needs no query coordinates.
 */
export const NoteRowActions = ({
  noteId,
  title,
  className,
}: {
  noteId: string;
  title: string;
  className?: string;
}) => {
  const [renameOpen, setRenameOpen] = useState(false);
  const [draft, setDraft] = useState(title);

  const { mutate: renameNote, isPending: isRenaming } = useMutation(
    orpc.notesRouter.renameNote.mutationOptions({
      onSuccess: () => {
        toast.success("Note renamed");
        setRenameOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const { mutate: deleteNote, isPending: isDeleting } = useMutation(
    orpc.notesRouter.deleteNote.mutationOptions({
      onSuccess: () => {
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
              className={cn("size-7 shrink-0", className)}
              aria-label={`Actions for ${title || "note"}`}
            />
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
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
