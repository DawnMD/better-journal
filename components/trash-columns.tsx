"use client";

import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { InferClientOutputs } from "@orpc/client";
import {
  ColumnDef,
  createExpandedRowModel,
  rowExpandingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { TrashDropdownActions } from "./trash-dropdown-actions";

export type TrashJournals = InferClientOutputs<
  typeof orpc.journalRouter.getTrashedJournal.call
>[number];

/**
 * What the trash table can do: a journal's row expands to list its notes.
 * TanStack Table v9 only exposes the APIs of features registered here.
 */
export const trashTableFeatures = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
});

export const columns: ColumnDef<typeof trashTableFeatures, TrashJournals>[] = [
  {
    id: "expand",

    header: "Notes",

    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon"
        onClick={row.getToggleExpandedHandler()}
      >
        <span className="font-mono text-xs tabular-nums">
          {row.original.notes.length}
        </span>
        {!!row.original.notes.length && (
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              row.getIsExpanded() && "rotate-90",
            )}
          />
        )}
      </Button>
    ),
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="font-serif text-base">{row.original.title}</span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const item = row.original;

      return <TrashDropdownActions id={item.id} />;
    },
  },
];
