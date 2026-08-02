import Link from "next/link";

/**
 * The bottom of the only page a stranger sees.
 *
 * Three links and a line of copy. There is no pricing page, no blog and no
 * careers section to link to, and inventing columns of dead headings to fill the
 * width is how a footer starts lying about the size of the thing above it.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p className="font-serif text-[15px] font-medium tracking-tight">
            Better&nbsp;Journal
          </p>
          <p className="text-xs text-muted-foreground">
            A private place to write things down.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href="/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="hover:text-foreground">
            Create an account
          </Link>
          <a
            href="https://github.com/DawnMD/better-journal"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
