"use client";

import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { InferClientOutputs } from "@orpc/client";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { TrashDropdownActions } from "./trash-dropdown-actions";

export type TrashJournals = InferClientOutputs<
  typeof orpc.journalRouter.getTrashedJournal.call
>[number];

export const columns: ColumnDef<TrashJournals>[] = [
  {
    id: "expand",
    enableSorting: false,
    enableHiding: false,

    header: "Notes",

    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon"
        onClick={row.getToggleExpandedHandler()}
      >
        <span>{row.original.notes.length}</span>
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
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const item = row.original;

      return <TrashDropdownActions id={item.id} />;
    },
  },
];
