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
import { isConflictError } from "@/lib/orpc.errors";
import { orpc } from "@/lib/orpc.query";
import { MAX_TAG_NAME, normalizeTagName } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** How many notes a merge would move, once a collision is known about. */
type Collision = { name: string; noteCount: number };

function noteCountLabel(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`;
}

/**
 * Per-tag rename/delete menu, structurally the same as note-row-actions.
 *
 * Two deliberate divergences from that component:
 *
 *  - Rename has to cope with a name the user already owns. The collision is
 *    detected here first, against the `getAllTags` cache this page is already
 *    reading, so the common case never spends a round trip to be told no; the
 *    server's CONFLICT is still handled, because a second tab can create the
 *    name between the check and the call.
 *  - Delete is behind a confirmation, which note deletion is not. Deleting a
 *    note is visible and local; deleting a tag silently strips it from every
 *    note in every journal, and nothing on screen shows what was lost.
 */
export const TagRowActions = ({
  tagId,
  name,
  noteCount,
  className,
}: {
  tagId: string;
  name: string;
  noteCount: number;
  className?: string;
}) => {
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  /** Non-null once the new name is known to be taken; drives the merge prompt. */
  const [collision, setCollision] = useState<Collision | null>(null);

  const allTagsKey = orpc.tagRouter.getAllTags.queryKey();

  const { mutate: renameTag, isPending: isRenaming } = useMutation(
    orpc.tagRouter.renameTag.mutationOptions({
      // The tag list is patched (or, after a merge, refetched) centrally, from
      // lib/query/cache-effects.ts.
      onSuccess: (result) => {
        toast.success(
          result.mergedFrom ? `Merged into "${result.name}"` : "Tag renamed",
        );

        setRenameOpen(false);
        setCollision(null);
      },
      onError: (error) => {
        // The genuine race: the name was free when we checked and taken by the
        // time we wrote. Same question, same dialog, using the server's counts.
        if (isConflictError(error)) {
          const data = (error as { data?: unknown }).data as
            | { noteCount?: number }
            | undefined;

          setCollision({
            name: normalizeTagName(draft),
            noteCount: data?.noteCount ?? 0,
          });

          return;
        }

        toast.error(error.message);
      },
    }),
  );

  const { mutate: deleteTag, isPending: isDeleting } = useMutation(
    orpc.tagRouter.deleteTag.mutationOptions({
      onSuccess: () => {
        toast.success("Tag deleted");
        setDeleteOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const normalized = normalizeTagName(draft);
  const canSubmit =
    normalized.length > 0 && normalized !== name && !isRenaming;

  /**
   * Checks the draft against the names already in cache before calling.
   *
   * Catching the collision here is what lets the dialog say "merge 12 notes
   * into 'office'?" instead of surfacing a refusal — the user cannot see the
   * difference between "Office" and "office", so a bare rejection reads as a bug.
   */
  const submit = () => {
    if (!canSubmit) return;

    const existing = queryClient
      .getQueryData(allTagsKey)
      ?.find((tag) => tag.name === normalized && tag.id !== tagId);

    if (existing) {
      setCollision({ name: existing.name, noteCount: existing.noteCount });
      return;
    }

    renameTag({ tagId, name: normalized });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8 shrink-0", className)}
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-fit" align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraft(name);
              setCollision(null);
              setRenameOpen(true);
            }}
          >
            <PencilIcon />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setCollision(null);
        }}
        disablePointerDismissal={isRenaming}
      >
        <DialogContent className="sm:max-w-sm">
          {collision ? (
            <>
              <DialogHeader>
                <DialogTitle>Merge into &ldquo;{collision.name}&rdquo;?</DialogTitle>
                <DialogDescription>
                  You already have a tag called &ldquo;{collision.name}&rdquo;.{" "}
                  {noteCountLabel(noteCount)} will move onto it, and &ldquo;
                  {name}&rdquo; will be gone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={isRenaming}
                  onClick={() => setCollision(null)}
                >
                  Back
                </Button>
                <Button
                  disabled={isRenaming}
                  onClick={() =>
                    renameTag({ tagId, name: collision.name, merge: true })
                  }
                >
                  Merge
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Rename tag</DialogTitle>
                <DialogDescription>
                  This tag is used across every journal, so the new name applies
                  everywhere.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <Field>
                  <FieldLabel htmlFor={`rename-tag-${tagId}`}>Name</FieldLabel>
                  <Input
                    id={`rename-tag-${tagId}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    autoComplete="off"
                    maxLength={MAX_TAG_NAME}
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
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        disablePointerDismissal={isDeleting}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{name}&rdquo;?</DialogTitle>
            <DialogDescription>
              It will be removed from {noteCountLabel(noteCount)}. The notes
              themselves are not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={isDeleting}>
                  Cancel
                </Button>
              }
            />
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteTag({ tagId })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
