import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// `/` is the landing page, and is public for the obvious reason: protecting the
// front door means every stranger's first impression of the app is a password
// field. It reads the session itself so it can offer the app to someone who
// already has one — `auth()` returns a null `userId` here rather than throwing,
// which is exactly the difference between a public route and an unmatched one.
//
// `/sso-callback` is where Google and GitHub return the browser. It runs before
// there is a session — that is the whole point of it — so protecting it would
// bounce every social sign-in straight back to the form it just came from.
//
// `/share/<token>` is a note its owner deliberately published. Requiring a
// session there would defeat the entire feature: the recipient is precisely the
// person without an account. The token in the path is the authorization, and it
// is checked by `shareRouter.getSharedNote` rather than here — Clerk has nothing
// to say about a reader who is nobody.
//
// Note what is *not* on this list: `/rpc`. The share page renders on the server
// and reaches the router directly, so the public procedure never needs an
// anonymous HTTP entrance, and it does not get one.
const isPublicRoute = createRouteMatcher([
  "/",
  "/share(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
