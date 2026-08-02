import { LEVEL_VAR } from "@/components/dashboard/viz-tokens";
import { TagChip } from "@/components/tags/tag-chip";

/**
 * What the app looks like, without a screenshot.
 *
 * A PNG would be the obvious thing and is the wrong one here: it would be light
 * or dark but not both, would go stale the first time the top bar changes, and
 * would ship 200KB to say something the page can draw in markup. This is built
 * from the same tokens the real screens use — the wordmark in the display serif,
 * the entry in the editor's measure, the heatmap on the validated `--viz-level`
 * ramp — so it repaints with the theme and cannot drift from the palette.
 *
 * Entirely decorative: `aria-hidden`, because everything it depicts is said in
 * words by the hero beside it and the feature list below it. A screen reader
 * walking a fake note titled "Notes on a slow morning" learns nothing.
 */
export function HeroPreview() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      {/* The top bar, at the size it really is. */}
      <div className="flex h-9 items-center gap-2 border-b border-border/70 px-4 text-[11px] text-muted-foreground">
        <span className="font-serif text-[13px] text-foreground">
          Better&nbsp;Journal
        </span>
        <span className="text-border">/</span>
        <span>Personal</span>
        <span className="ml-auto font-mono tracking-wide">⌘K</span>
      </div>

      {/* One entry, set the way the editor sets it. */}
      <div className="space-y-3 px-5 py-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Tue 14 Jan · 6:42
        </p>
        <h2 className="font-serif text-xl tracking-tight">
          Notes on a slow morning
        </h2>
        <p className="font-serif text-[15px] leading-relaxed text-pretty text-muted-foreground">
          Woke before the alarm and let the coffee take its time. Made a list of
          the three things that actually matter this week, then crossed off the
          fourth one I had snuck on to feel productive.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <TagChip name="mornings" size="sm" />
          <TagChip name="reading" size="sm" />
          <TagChip name="work" size="sm" />
        </div>
      </div>

      {/* And the year it belongs to. */}
      <div className="space-y-2 border-t border-border/70 bg-muted/40 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            This year
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            213 entries · 61-day streak
          </p>
        </div>
        <ActivityStrip />
      </div>
    </div>
  );
}

/** Weeks across, weekdays down — the dashboard's heatmap, cropped to a strip. */
function ActivityStrip() {
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-0.75 overflow-hidden">
      {Array.from({ length: WEEKS * 7 }, (_, index) => (
        <span
          key={index}
          className="size-2 rounded-xs"
          style={{ backgroundColor: LEVEL_VAR[strength(index)] }}
        />
      ))}
    </div>
  );
}

const WEEKS = 40;

/**
 * A plausible year of writing, with no `Math.random` in it.
 *
 * The pattern has to be identical on the server and in the browser or React
 * discards the tree on hydration, so the "randomness" is arithmetic. It has to
 * be a *mixing* hash, though, not just a multiply: `index * k % prime` steps by
 * a constant, which lays the five shades out in strict rotation and paints
 * visible diagonal stripes across the grid. This is the murmur3 finaliser —
 * multiply, xor-shift, multiply — which decorrelates neighbours, and `imul`
 * keeps the intermediate products in 32 bits so the two runtimes cannot
 * disagree about a float.
 *
 * Binned to the same five steps `activityLevel` uses, with about a third of days
 * empty so it does not read as a filled rectangle.
 */
function strength(index: number): 0 | 1 | 2 | 3 | 4 {
  let hash = Math.imul(index + 1, 2654435761) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;

  const noise = hash % 100;

  if (noise < 34) return 0;
  if (noise < 58) return 1;
  if (noise < 77) return 2;
  if (noise < 91) return 3;
  return 4;
}
