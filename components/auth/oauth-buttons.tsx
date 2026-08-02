"use client";

import { AuthError } from "@/components/auth/auth-shell";
import { AFTER_AUTH_URL } from "@/components/auth/navigate-after-auth";
import { Button } from "@/components/ui/button";
import { Swirling } from "@/components/ui/swirling";
import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";

/** The providers enabled on the Clerk instance. Add one here and to `PROVIDERS`. */
type OAuthProvider = "oauth_google" | "oauth_github";

const PROVIDERS: { strategy: OAuthProvider; label: string; icon: React.ReactNode }[] =
  [
    { strategy: "oauth_google", label: "Google", icon: <GoogleIcon /> },
    { strategy: "oauth_github", label: "GitHub", icon: <GitHubIcon /> },
  ];

/**
 * "Continue with…" — the same two buttons on both auth screens.
 *
 * `signIn.sso()` on the sign-up page too, deliberately: a social login cannot
 * know in advance whether the account exists, so Clerk always opens it as a
 * sign-in and hands `/sso-callback` an attempt that is *transferable* to a
 * sign-up when there was no user. Splitting the two here would only mean
 * guessing at something the callback already resolves.
 *
 * `redirectCallbackUrl` is where the provider drops the browser back into this
 * app; `redirectUrl` is where Clerk sends it when it could finish the whole
 * thing itself and no callback work was needed.
 *
 * Errors are held locally rather than read off the `useSignIn()` signal because
 * this renders inside the sign-up flow as well, whose banner watches the
 * *sign-up* signal and would silently drop an SSO failure.
 */
export function OAuthButtons() {
  const { signIn } = useSignIn();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signInWith = async (strategy: OAuthProvider) => {
    setPending(strategy);
    setError(null);

    const { error } = await signIn.sso({
      strategy,
      redirectCallbackUrl: "/sso-callback",
      redirectUrl: AFTER_AUTH_URL,
    });

    // On success the browser is already on its way to the provider, so there is
    // nothing to clear — only a failure returns to a page anyone will see.
    if (error) {
      setError(error.message);
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AuthError errors={error ? [{ message: error }] : null} />
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map(({ strategy, label, icon }) => (
          <Button
            key={strategy}
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={pending !== null}
            onClick={() => signInWith(strategy)}
          >
            {pending === strategy ? <Swirling className="size-4" /> : icon}
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
