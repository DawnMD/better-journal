import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontalIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        {/* Matches the heading the table now renders, so the page does not grow
            a title the moment the data lands. */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-96" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Notes</TableHead>
              <TableHead>Title</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-8 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-48" />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontalIcon />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}
