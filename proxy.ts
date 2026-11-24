import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk's middleware only puts the session on the request here. It does not
// decide who gets in: path matching can disagree with how Next routes a
// request, which is why Clerk deprecated `createRouteMatcher`. Each protected
// resource checks the session itself with `auth.protect()`:
//
// - the signed-in shell, `app/(main-app)/layout.tsx`, and every page under it;
// - the `/rpc` route handler, `app/rpc/[[...rest]]/route.ts`.
//
// Public routes are public because they make no such call:
//
// `/` is the landing page, and is public for the obvious reason: protecting the
// front door means every stranger's first impression of the app is a password
// field. It reads the session itself so it can offer the app to someone who
// already has one.
//
// `/sso-callback` is where Google and GitHub return the browser. It runs before
// there is a session — that is the whole point of it — so protecting it would
// bounce every social sign-in straight back to the form it just came from.
//
// `/share/<token>` is a note its owner deliberately published. Requiring a
// session there would defeat the entire feature: the recipient is precisely the
// person without an account. The token in the path is the authorization, and it
// is checked by `shareRouter.getSharedNote` — Clerk has nothing to say about a
// reader who is nobody.
//
// Note that `/rpc` is *not* public. The share page renders on the server and
// reaches the router directly, so the public procedure never needs an anonymous
// HTTP entrance, and it does not get one.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
