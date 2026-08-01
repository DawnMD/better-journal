import { cn } from "@/lib/utils";

/**
 * The measure each screen is set to.
 *
 * Three widths, named for what they hold rather than for a number, because the
 * number is the part that drifts: five pages repeating `max-w-5xl mx-auto px-4`
 * is five places to forget when one of them changes.
 *
 * `prose` is the one that matters. ~68 characters is the line length typography
 * has agreed on for continuous reading for about a century, and the editor is
 * continuous reading — it is the whole reason the sidebar had to go, since a
 * fixed 256px column plus a 68ch measure leaves a page that is mostly margin.
 */
const WIDTHS = {
  /** The editor. A reading measure, not a layout width. */
  prose: "max-w-[68ch]",
  /** Dashboard, tags, trash — content that is read in blocks, not lines. */
  default: "max-w-5xl",
  /** The calendar, which wants every column it can get. */
  wide: "max-w-6xl",
} as const;

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-6",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
