"use client";

import { invalidateAfterTagChange } from "@/components/tags/tag-cache";
import { TagChip } from "@/components/tags/tag-chip";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc.query";
import { MAX_TAG_NAME, normalizeTagName } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The tag bar above the editor surface.
 *
 * There is no separate "create tag" procedure and no create step in this UI:
 * `addTagToNote` takes a *name* and `connectOrCreate`s it, so picking an
 * existing tag and inventing a new one are the same call. That is why the
 * combobox can offer both from one list without the two paths ever diverging.
 */
export const NoteTags = ({ noteId }: { noteId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // Plain useQuery, not the useSuspenseQuery the editor uses for the note
  // itself. The editor is already suspended on getNoteById; suspending again
  // here would let a failing tag query blank the entire note, which is a bad
  // trade for a row of chips.
  const { data: tags } = useQuery(
    orpc.tagRouter.getTagsForNote.queryOptions({ input: { noteId } }),
  );

  const { data: allTags } = useQuery(orpc.tagRouter.getAllTags.queryOptions());

  const tagsKey = orpc.tagRouter.getTagsForNote.queryKey({
    input: { noteId },
  });

  /** Both mutations return this note's full tag list, so both patch it the same way. */
  const onTagsChanged = (next: { id: string; name: string }[]) => {
    queryClient.setQueryData(tagsKey, next);
    // Patched above, so getTagsForNote is excluded from the fan-out. getAllTags
    // is not: counts moved, and a brand-new tag row may have appeared.
    invalidateAfterTagChange(queryClient, { tagsForNote: false });
  };

  const { mutate: addTag, isPending: isAdding } = useMutation(
    orpc.tagRouter.addTagToNote.mutationOptions({
      onSuccess: (next) => {
        onTagsChanged(next);
        setDraft("");
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const { mutate: removeTag, isPending: isRemoving } = useMutation(
    orpc.tagRouter.removeTagFromNote.mutationOptions({
      onSuccess: onTagsChanged,
      onError: (error) => toast.error(error.message),
    }),
  );

  // Not optimistic, following the position stated in note-row-actions.tsx: the
  // round trip is fast, and a chip that appeared and then vanished on failure
  // is more confusing than a brief wait.
  const isPending = isAdding || isRemoving;

  const normalized = normalizeTagName(draft);
  const attached = new Set(tags?.map((tag) => tag.id));

  // Substring-filtered here rather than by cmdk, so "create" below can reason
  // about the same list the user is looking at.
  const suggestions = (allTags ?? []).filter(
    (tag) => !attached.has(tag.id) && tag.name.includes(normalized),
  );

  /** Only offer to create when the typed name is not already an exact option. */
  const canCreate =
    normalized.length > 0 &&
    normalized.length <= MAX_TAG_NAME &&
    !(allTags ?? []).some((tag) => tag.name === normalized);

  return (
    // Sits directly under the title with real space beneath it, rather than in a
    // bordered strip of its own: tags belong to the entry, so they read as part
    // of its heading block instead of as a control panel bolted above the text.
    <div className="mb-6 flex flex-wrap items-center gap-1.5">
      {tags?.map((tag) => (
        <TagChip
          key={tag.id}
          name={tag.name}
          disabled={isPending}
          onRemove={() => removeTag({ noteId, tagId: tag.id })}
          className={cn(isPending && "pointer-events-none opacity-60")}
        />
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            />
          }
        >
          <PlusIcon className="size-3" />
          Add tag
        </PopoverTrigger>

        <PopoverContent align="start" className="w-64 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Find or create a tag..."
              value={draft}
              onValueChange={setDraft}
              maxLength={MAX_TAG_NAME}
            />
            <CommandList>
              {suggestions.length === 0 && !canCreate && (
                <CommandEmpty>
                  {/* Three different reasons the list can be empty, and telling
                      a user with ten tags that they have none is the kind of
                      wrong that makes a feature look broken. */}
                  {normalized.length > 0
                    ? "Already on this note."
                    : (allTags?.length ?? 0) > 0
                      ? "Every tag is already on this note."
                      : "No tags yet. Type to create one."}
                </CommandEmpty>
              )}

              {suggestions.length > 0 && (
                <CommandGroup>
                  {suggestions.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => addTag({ noteId, name: tag.name })}
                    >
                      <TagChip name={tag.name} size="sm" />
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {tag.noteCount}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {canCreate && (
                <CommandGroup>
                  <CommandItem
                    // Prefixed so it can never collide with a tag id above.
                    value={`create:${normalized}`}
                    onSelect={() => addTag({ noteId, name: normalized })}
                  >
                    <PlusIcon />
                    <span className="truncate">
                      Create &ldquo;{normalized}&rdquo;
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
