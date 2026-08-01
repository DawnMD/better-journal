"use client";

import { CreateJournalDialog } from "@/components/create-journal-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Which journal you are in, and how to get to another one.
 *
 * This replaces the sidebar's journal list. The list was a browse surface built
 * for a tree, and a personal journal is not one — people keep somewhere between
 * one and five, so the useful control is a *switcher*: it names where you are,
 * which a list of five links never did, and costs one line of the top bar
 * instead of a permanent 256px column. Browsing what is *inside* a journal is
 * the calendar's job, and finding a specific note is ⌘K's.
 *
 * Popover + Command rather than a plain menu, matching the tag filter bar and the
 * editor's tag combobox: one interaction pattern for "pick a thing from a list
 * you own", whatever the list's length.
 */
export const JournalSwitcher = () => {
  const params = useParams<{ journalId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: journals, isPending } = useQuery(
    orpc.journalRouter.getAllJournal.queryOptions(),
  );

  const { mutate: moveJournalToTrash } = useMutation(
    orpc.journalRouter.moveToTrash.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getAllJournal.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getTrashedJournal.queryKey(),
        });
        toast.success("Moved to trash");
      },
      onError: (data) => {
        toast.error(data.message);
      },
    }),
  );

  const current = journals?.find((journal) => journal.id === params.journalId);

  // Only a placeholder while the list is genuinely in flight. Once it has
  // loaded, a route whose journal is not in it — trashed from another tab —
  // falls back to the neutral label rather than a skeleton that never resolves.
  // Same reasoning the breadcrumb this replaces used.
  if (isPending) {
    return <Skeleton className="h-8 w-32" />;
  }

  const label = current?.title ?? (params.journalId ? "Journal" : "Journals");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-0 gap-1.5 px-2 font-normal"
              aria-label="Switch journal"
            />
          }
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>

        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Find a journal..." />
            <CommandList>
              {/* Two different empties. CommandEmpty only fires when the filter
                  matched nothing, which is a different situation from owning no
                  journals at all — telling someone with six journals that they
                  have none is the kind of wrong that reads as a bug. */}
              <CommandEmpty>No journals match.</CommandEmpty>

              {journals?.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No journals yet.
                </p>
              )}

              {journals && journals.length > 0 && (
                <CommandGroup>
                  {journals.map((journal) => {
                    const isCurrent = journal.id === params.journalId;

                    return (
                      // The row menu is overlaid on the item rather than nested
                      // inside its content, for the reason note-event.tsx sets
                      // out: cmdk fires `onSelect` from the item's own click
                      // handler, so a button living inside it would navigate as
                      // well as open. Stopping propagation on the trigger is
                      // what keeps the two apart.
                      <div key={journal.id} className="relative">
                        <CommandItem
                          value={`${journal.title} ${journal.id}`}
                          onSelect={() => {
                            setOpen(false);
                            router.push(`/journal/${journal.id}`);
                          }}
                          className="pr-9"
                        >
                          <CheckIcon
                            className={cn(
                              "size-3.5 shrink-0",
                              isCurrent ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{journal.title}</span>
                        </CommandItem>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${journal.title}`}
                                className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              />
                            }
                          >
                            <MoreHorizontalIcon className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-fit">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                moveJournalToTrash({ id: journal.id })
                              }
                            >
                              <Trash2Icon />
                              <span>Move to Trash</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </CommandGroup>
              )}

              {/* Pinned below the list rather than mixed into it, so it keeps
                  the same position whether you have one journal or ten. */}
              <CommandGroup className="border-t border-border/60">
                <CommandItem
                  value="new-journal"
                  onSelect={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  <span>New journal…</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateJournalDialog open={creating} onOpenChange={setCreating} />
    </>
  );
};
