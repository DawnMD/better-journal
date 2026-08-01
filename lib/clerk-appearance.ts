/**
 * How Clerk's hosted forms are dressed.
 *
 * `/sign-in` and `/sign-up` are the only two screens an unauthenticated visitor
 * ever sees, and they were entirely default — so the first impression of the app
 * was Clerk's blue-and-Inter card, and the paper theme only appeared *after*
 * signing in. That is exactly backwards.
 *
 * A handful of variables rather than a stack of element overrides. Clerk derives
 * its own scale from `colorPrimary`, so handing it the clay accent, the app's
 * fonts and the app's radius gets the whole form most of the way there; chasing
 * individual class names would be a much larger surface pinned to Clerk's
 * internal DOM.
 *
 * Literal values, not `var(--brand)`: Clerk parses these to build derived shades
 * and cannot resolve a CSS custom property against an element it does not own.
 * They are the computed sRGB of the tokens in app/globals.css — if those move,
 * these move with them.
 *
 * Two sets, because there are two themes. Clerk takes its palette as a prop, so
 * it cannot follow `.dark` on its own — and one fixed palette would put a sheet
 * of white paper in the middle of a dark page, which is worse than the default
 * was. `clerkAppearanceFor` is what the two auth pages call.
 */
const shared = {
  fontFamily: "var(--font-sans)",
  fontFamilyButtons: "var(--font-sans)",
  borderRadius: "0.375rem",
};

/** --brand / --foreground / --card / --muted-foreground, light theme. */
const light = {
  variables: {
    ...shared,
    colorPrimary: "#ae5528",
    colorText: "#1f1915",
    colorBackground: "#fffdfa",
    colorInputBackground: "#fffdfa",
    colorInputText: "#1f1915",
    colorTextSecondary: "#706b64",
  },
};

/** The same tokens read out of `.dark`. */
const dark = {
  variables: {
    ...shared,
    colorPrimary: "#dc9064",
    colorText: "#f2f0ec",
    colorBackground: "#1e1b18",
    colorInputBackground: "#2a2723",
    colorInputText: "#f2f0ec",
    colorTextSecondary: "#a29e98",
  },
};

/**
 * Light stands in while `resolvedTheme` is still undefined. That is the right
 * fallback rather than a guess: <html> carries `suppressHydrationWarning`, so the
 * server never committed to a theme either, and Clerk renders its own skeleton
 * over the window in which this resolves.
 */
export function clerkAppearanceFor(resolvedTheme: string | undefined) {
  return resolvedTheme === "dark" ? dark : light;
}
