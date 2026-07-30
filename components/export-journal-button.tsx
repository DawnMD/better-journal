"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { useMutation } from "@tanstack/react-query";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

/**
 * Downloads a journal as Markdown or JSON.
 *
 * The procedure returns the file *content*, and the browser turns it into a
 * download here via an object URL. That keeps the endpoint a plain typed RPC
 * call — testable without HTTP, and no second auth path — at the cost of holding
 * the export in memory. Fine at journal scale; a streaming route handler would
 * be the move if exports ever ran to hundreds of megabytes.
 */
export const ExportJournalButton = ({ journalId }: { journalId: string }) => {
  const timeZone = clientTimeZone();

  const { mutate: exportJournal, isPending } = useMutation(
    orpc.exportRouter.exportJournal.mutationOptions({
      onSuccess: (file) => {
        const blob = new Blob([file.content], { type: file.contentType });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();

        // Without this the blob is retained for the life of the document.
        URL.revokeObjectURL(url);

        toast.success(`Exported ${file.filename}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={isPending}>
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4" />
            )}
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            exportJournal({ journalId, format: "markdown", timeZone })
          }
        >
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportJournal({ journalId, format: "json", timeZone })}
        >
          JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
