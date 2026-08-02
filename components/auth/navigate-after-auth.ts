/** Where a completed sign-in or sign-up lands. Mirrors the *_FALLBACK_REDIRECT_URL env vars. */
export const AFTER_AUTH_URL = "/dashboard";

/**
 * The `navigate` callback handed to `finalize()` / `setActive()`.
 *
 * Clerk asks for a navigation function rather than a URL so it can run the hop
 * itself, at the one moment the session is being written. `decorateUrl` is the
 * reason it cannot be a plain `router.push`: under Safari's ITP the session
 * cookie needs a round trip through Clerk's own domain to survive, and in that
 * case the decorated URL comes back absolute. A client-side push to another
 * origin does nothing, so an absolute URL has to become a real navigation.
 *
 * A pending session task (organization selection and friends) is not special
 * cased: this instance configures none, and `auth.protect()` in the middleware
 * would route to the task anyway on the way to the destination.
 *
 * Both parameters are typed structurally so this file does not have to reach
 * for Next's internal router type or for `@clerk/shared`, which pnpm does not
 * expose to app code.
 */
export function navigateAfterAuth(
  router: { push: (href: string) => void },
  destination: string = AFTER_AUTH_URL,
) {
  return ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    const url = decorateUrl(destination);

    if (url.startsWith("http")) {
      window.location.href = url;
    } else {
      router.push(url);
    }
  };
}
