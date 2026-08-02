"use client";

import { ResetPasswordFlow } from "@/components/auth/reset-password-flow";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { useRedirectWhenSignedIn } from "@/components/auth/use-redirect-when-signed-in";
import { useState } from "react";

/**
 * `/sign-in`, and every detour from it.
 *
 * The route is still an optional catch-all because Clerk sends its own
 * redirects to sub-paths of `NEXT_PUBLIC_CLERK_SIGN_IN_URL`; what changed is
 * that the segment no longer selects a Clerk-rendered screen. Which form shows
 * is state, not a URL, because a password reset is one continuous `SignIn`
 * attempt held in the client — navigating between its steps would be a chance
 * to drop it.
 */
export default function SignInPage() {
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const signedIn = useRedirectWhenSignedIn();

  if (signedIn) return null;

  return resetEmail === null ? (
    <SignInFlow onForgotPassword={setResetEmail} />
  ) : (
    <ResetPasswordFlow
      initialEmail={resetEmail}
      onCancel={() => setResetEmail(null)}
    />
  );
}
