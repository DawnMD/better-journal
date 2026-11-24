// Imported first, and not only for its side effect on `globalThis.$client`:
// `lib/orpc.client` reads that global once, at module scope, and falls back to
// an HTTP link when it is missing — a link that throws on the server by design.
// Evaluating this module before the global is installed would turn a shared note
// into a 500, so the ordering is load-bearing rather than stylistic.
import "@/lib/orpc.server";

import { createNoteStaticEditor } from "@/components/editor/note-static-plugins";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { ReaderZoneProvider } from "@/components/reader-zone";
import { PageContainer } from "@/components/shell/page-container";
import { SharedDateline } from "@/components/share/shared-dateline";
import { Button } from "@/components/ui/button";
import { EditorStatic } from "@/components/ui/editor-static";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/lib/orpc.client";
import { isNotFoundError } from "@/lib/orpc.errors";
import { readerCalendarFromCookie } from "@/server/lib/reader-calendar";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

/**
 * One entry, readable by anyone holding the link.
 *
 * The only page in the app that renders journal content without a session, so it
 * is deliberately the plainest one: no top bar, no ⌘K palette, no journal
 * switcher — none of which a stranger has anything to switch between — and no
 * client-side query. The note is fetched here and rendered with `PlateStatic`,
 * which means the page ships markup rather than an editor, and the recipient
 * never downloads the writing surface for a document they cannot write to.
 *
 * The token stays in the URL and never reaches application JavaScript.
 */

/**
 * `cache` because `generateMetadata` and the component both need the note, and
 * without it that is two identical queries per view. Deduped for the life of one
 * request only, which is the correct lifetime: a revoked link must go dark
 * immediately, not at the end of some cache window.
 */
const loadSharedNote = cache(async (token: string) => {
  try {
    return await client.shareRouter.getSharedNote({ token });
  } catch (error) {
    // Revoked, deleted, trashed or never real — all the same answer, and all of
    // them a wrong address rather than a failure. Anything else is a genuine
    // error and belongs to the error boundary.
    if (isNotFoundError(error)) return null;

    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/share/[token]">): Promise<Metadata> {
  const { token } = await params;
  const note = await loadSharedNote(token);

  return {
    title: note?.title ?? "Shared entry",
    // The load-bearing line. A share link is unlisted, not public: it is meant
    // for the person it was sent to, and a crawler that reaches one — pasted in
    // a public issue, forwarded into an indexed archive — must not put a private
    // journal entry into a search result. `nocache` also keeps it out of the
    // engines' own snapshots, which outlive a revoke.
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * The header and footer are the static shell, the same for every link. The
 * note itself reads the token and the `tz` cookie, so it renders per request
 * behind Suspense, and nothing about it is cached: a revoked link goes dark on
 * the very next request.
 */
export default function SharedNotePage({ params }: PageProps<"/share/[token]">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-backdrop-blur:bg-background/65">
        <div className="mx-auto flex h-14 w-full max-w-[68ch] items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 rounded-sm font-serif text-[15px] font-medium tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Better&nbsp;Journal
          </Link>
          <span className="text-xs text-muted-foreground">Shared entry</span>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/sign-up" />}
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <PageContainer width="prose">
          <Suspense fallback={<SharedNoteSkeleton />}>
            <SharedNote params={params} />
          </Suspense>
        </PageContainer>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto w-full max-w-[68ch] px-4 py-8 text-xs text-muted-foreground sm:px-6">
          Shared from a private journal. Only people with this link can read it.
        </div>
      </footer>
    </>
  );
}

async function SharedNote({ params }: Pick<PageProps<"/share/[token]">, "params">) {
  const { token } = await params;
  const note = await loadSharedNote(token);

  if (!note) notFound();

  // Seeds the dateline's reader zone. Best-effort, and only until the browser
  // answers — see SharedDateline.
  const { zone } = await readerCalendarFromCookie();

  // The read-only twin of the editor: the note document schema's types, bound
  // to the `*Static` components instead of the React ones.
  const editor = createNoteStaticEditor(note.content);

  return (
    <ReaderZoneProvider initialZone={zone}>
      <article>
        <SharedDateline createdAt={note.createdAt.toISOString()} />
        {/* The same face and measure the writer saw, so a shared entry reads
            as the thing that was written rather than a quotation of it. */}
        <h1 className="font-serif text-[36px] leading-tight tracking-tight text-balance">
          {note.title ?? "Untitled"}
        </h1>
        <EditorStatic
          editor={editor}
          className="pt-4 pb-8 font-serif text-[18px] leading-[1.75]"
        />
      </article>
    </ReaderZoneProvider>
  );
}

function SharedNoteSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
