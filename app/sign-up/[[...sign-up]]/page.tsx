"use client";

import { SignUpFlow } from "@/components/auth/sign-up-flow";
import { useRedirectWhenSignedIn } from "@/components/auth/use-redirect-when-signed-in";

/**
 * `/sign-up`. An optional catch-all for the same reason `/sign-in` is: Clerk
 * points its own redirects at sub-paths of the configured sign-up URL.
 */
export default function SignUpPage() {
  const signedIn = useRedirectWhenSignedIn();

  if (signedIn) return null;

  return <SignUpFlow />;
}
