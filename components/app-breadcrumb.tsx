"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Fragment } from "react";

type Crumb = {
  key: string;
  label: string;
  /** Omitted on the trailing crumb, which renders as the current page. */
  href?: string;
  /** Title is still resolving — show a placeholder rather than a guess. */
  pending?: boolean;
};

/**
 * Path trail for the signed-in shell.
 *
 * Both title lookups reuse query keys that are already populated on the pages
 * that need them — `getAllJournal` by the sidebar's journal list, `getNoteById`
 * by the note editor — so naming a journal or note costs no extra request, and a
 * rename made elsewhere propagates here through the same cache entry.
 */
export function AppBreadcrumb() {
  const pathname = usePathname();
  const { journalId, noteId } = useParams<{
    journalId?: string;
    noteId?: string;
  }>();

  const { data: journals, isPending: journalsPending } = useQuery(
    orpc.journalRouter.getAllJournal.queryOptions(),
  );

  // Plain useQuery, not the useSuspenseQuery the editor uses against this same
  // key: the breadcrumb lives in the layout, above [noteId]/error.tsx, so a
  // locked or deleted note has to degrade to a fallback label here instead of
  // throwing the whole shell into an error boundary.
  const { data: note, isPending: notePending } = useQuery({
    ...orpc.notesRouter.getNoteById.queryOptions({
      input: { noteId: noteId ?? "" },
    }),
    enabled: Boolean(noteId),
  });

  const crumbs: Crumb[] = [{ key: "home", label: "Home", href: "/dashboard" }];

  if (pathname === "/trash") {
    crumbs.push({ key: "trash", label: "Trash" });
  } else if (journalId) {
    const journal = journals?.find((item) => item.id === journalId);

    crumbs.push({
      key: journalId,
      label: journal?.title || "Journal",
      href: `/journal/${journalId}`,
      // Only a placeholder while the list is in flight. A journal that is simply
      // absent from a loaded list (trashed in another tab) keeps the fallback
      // label rather than a skeleton that would never resolve.
      pending: journalsPending,
    });

    if (noteId) {
      crumbs.push({
        key: noteId,
        label: note?.title || "Untitled note",
        pending: notePending,
      });
    }
  }

  // Narrow screens keep the trailing pair only. On a note that means
  // journal → note: the note's own title matters more than the route to it.
  const isFolded = (index: number) => index < crumbs.length - 2;

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const truncate = "max-w-[45vw] truncate md:max-w-64";

          return (
            <Fragment key={crumb.key}>
              {index > 0 && (
                // A separator belongs to the crumb before it, so it folds away
                // with that crumb — otherwise the trail opens with a stray "›".
                <BreadcrumbSeparator
                  className={cn(isFolded(index - 1) && "hidden md:block")}
                />
              )}
              <BreadcrumbItem
                className={cn(isFolded(index) && "hidden md:inline-flex")}
              >
                {crumb.pending ? (
                  <Skeleton className="h-4 w-24" />
                ) : isLast ? (
                  <BreadcrumbPage className={truncate}>
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className={truncate}
                    render={<Link href={crumb.href ?? "/dashboard"} />}
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
