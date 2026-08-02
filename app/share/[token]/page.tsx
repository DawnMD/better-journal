// Imported first, and not only for its side effect on `globalThis.$client`:
// `lib/orpc.client` reads that global once, at module scope, and falls back to
// an HTTP link when it is missing — a link that throws on the server by design.
// Evaluating this module before the global is installed would turn a shared note
// into a 500, so the ordering is load-bearing rather than stylistic.
import "@/lib/orpc.server";

import { BaseBasicBlocksKit } from "@/components/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "@/components/editor/plugins/basic-marks-base-kit";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { PageContainer } from "@/components/shell/page-container";
import { SharedDateline } from "@/components/share/shared-dateline";
import { Button } from "@/components/ui/button";
import { EditorStatic } from "@/components/ui/editor-static";
import { client } from "@/lib/orpc.client";
import { isNotFoundError } from "@/lib/orpc.errors";
import { normalizeValue } from "@/lib/plate";
import { serverTimeZone } from "@/lib/timezone.server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSlateEditor } from "platejs";
import { cache } from "react";

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

export default async function SharedNotePage({
  params,
}: PageProps<"/share/[token]">) {
  const { token } = await params;
  const note = await loadSharedNote(token);

  if (!note) notFound();

  // Best-effort, and only until the browser answers — see SharedDateline.
  const timeZone = await serverTimeZone();

  // The read-only twin of the editor's plugin list: the same blocks and marks,
  // bound to the `*Static` components instead of the React ones. Built per
  // request because it carries this note's value.
  const editor = createSlateEditor({
    plugins: [...BaseBasicBlocksKit, ...BaseBasicMarksKit],
    value: normalizeValue(note.content) as never,
  });

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
          <article>
            <SharedDateline
              createdAt={note.createdAt.toISOString()}
              serverTimeZone={timeZone}
            />
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
