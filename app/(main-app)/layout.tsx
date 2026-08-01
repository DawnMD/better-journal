import { SearchPalette } from "@/components/search-palette";
import { AppTopbar } from "@/components/shell/app-topbar";

/**
 * The signed-in shell.
 *
 * Three elements, and no chrome that owns width. Each page sets its own measure
 * with `PageContainer` — a reading column for the editor, a wide one for the
 * calendar — which is the freedom a fixed sidebar could not give it.
 */
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Mounted once for the whole signed-in shell so ⌘K works on every page. */}
      <SearchPalette />
      <AppTopbar />
      <main className="flex-1">{children}</main>
    </>
  );
}
