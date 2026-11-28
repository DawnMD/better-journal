import { ReaderZoneProvider } from "@/components/reader-zone";
import { AppTopbar } from "@/components/shell/app-topbar";

/**
 * The signed-in shell.
 *
 * Three elements, and no chrome that owns width. Each page sets its own measure
 * with `PageContainer` — a reading column for the editor, a wide one for the
 * calendar — which is the freedom a fixed sidebar could not give it.
 *
 * Part of the static App Shell, so it never reads the request: no session, no
 * cookie. Every page under it checks the session itself with `auth.protect()`,
 * inside its own Suspense boundary. The shell holds no user data, so a signed-out
 * visitor who briefly sees it before the redirect has seen nothing of anyone's.
 */
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    // Seeded with UTC rather than the `tz` cookie: the shell has no use for it.
    // It only reads the reader zone in event handlers, after hydration, when
    // the browser's zone has taken over.
    // Pages that print dates on first paint mount their own cookie-seeded
    // provider, which overrides this one beneath it.
    <ReaderZoneProvider initialZone="UTC">
      {/* Full-text search is switched off (#37). The code is kept: mounting
          <SearchPalette /> from @/components/search-palette here, once for the
          whole shell, brings ⌘K back. */}
      <AppTopbar />
      <main className="flex-1">{children}</main>
    </ReaderZoneProvider>
  );
}
