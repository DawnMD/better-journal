/**
 * Display formatting that renders identically on the server and in the browser.
 *
 * `toLocaleString()` / `toLocaleDateString(undefined, …)` resolve against the
 * *ambient* locale, and in a Next.js app that is two different things: the Node
 * process's ICU default during SSR, and the reader's browser setting during
 * hydration. When they disagree — a server defaulting to `en-IN` rendering
 * "31 Jul" / "1,23,456" against a browser on `en-US` rendering "Jul 31" /
 * "123,456" — React throws a hydration mismatch.
 *
 * So the locale is pinned rather than inferred. The document already commits to
 * one language (`<html lang="en">`) and there is no i18n layer, so deferring to
 * whatever ICU happens to pick was never buying anything.
 *
 * Same reasoning as `dayKeyInTimeZone`'s hardcoded `en-CA` in ./timezone — an
 * explicit locale is the only kind that is reproducible.
 */

export const DISPLAY_LOCALE = "en-US";

/** `1234` → `"1,234"`, the same on both sides of hydration. */
export function formatNumber(value: number): string {
  return value.toLocaleString(DISPLAY_LOCALE);
}

/** `toLocaleDateString` with the locale pinned. */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleDateString(DISPLAY_LOCALE, options);
}
