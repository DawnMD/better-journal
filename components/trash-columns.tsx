"use client";

import { ColumnDef } from "@tanstack/react-table";

import { TrashDropdownActions } from "./trash-dropdown-actions";
import { Button } from "./ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrashJournals = {
  id: string;
  title: string;
  notes: { id: string; updatedAt: Date; title: string | null }[];
};

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
        <ChevronRight
          className={cn(
            "size-4 transition-transform",
            row.getIsExpanded() && "rotate-90",
          )}
        />
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
