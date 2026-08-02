"use client";

import { AFTER_AUTH_URL } from "@/components/auth/navigate-after-auth";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a signed-in visitor off the auth screens.
 *
 * Clerk's hosted `<SignIn />` did this for free; owning the form means owning
 * the redirect too. It matters because `/sign-in` and `/sign-up` are the only
 * routes the middleware leaves public, so nothing else would send an already
 * authenticated visitor — a stale tab, a bookmarked link — anywhere useful.
 *
 * `replace`, not `push`: the sign-in page is not somewhere to go back to.
 *
 * Returns whether the redirect is in flight so a page can render nothing rather
 * than flash a form at someone who is already signed in.
 */
export function useRedirectWhenSignedIn() {
  const { isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isSignedIn) router.replace(AFTER_AUTH_URL);
  }, [isSignedIn, router]);

  return isSignedIn === true;
}
