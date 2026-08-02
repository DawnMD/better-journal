"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { navigateAfterAuth } from "@/components/auth/navigate-after-auth";
import { Button } from "@/components/ui/button";
import { Swirling } from "@/components/ui/swirling";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Where Google and GitHub drop the browser back.
 *
 * The OAuth buttons always open a *sign-in*, because nothing on this side can
 * know whether the account exists until the provider answers. This route is
 * where that ambiguity is settled, and the branch order below is Clerk's own —
 * it is a decision table, not a sequence of ideas:
 *
 *   - the sign-in completed → make it a session;
 *   - a sign-up is transferable → the person has an account after all, move the
 *     verified identity onto a sign-in;
 *   - the sign-in is transferable → they do not, so mint the account;
 *   - anything still owed (a second factor, a new password) → back to the form
 *     that can ask for it;
 *   - the identity is already signed in on this client → just activate it.
 *
 * A visitor sees none of that: it is one spinner, and at most a second.
 *
 * `hasRun` guards against the effect running twice — Strict Mode in
 * development, any re-render from the signals in production — because these
 * steps are not idempotent.
 */
export default function SsoCallbackPage() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();

  const hasRun = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const navigate = navigateAfterAuth(router);

    void (async () => {
      if (!clerk.loaded || hasRun.current) return;
      hasRun.current = true;

      if (signIn.status === "complete") {
        await signIn.finalize({ navigate });
        return;
      }

      if (signUp.isTransferable) {
        await signIn.create({ transfer: true });
        // `status` is read after an await, so its type is the pre-call one.
        const status = signIn.status as typeof signIn.status | "complete";
        if (status === "complete") {
          await signIn.finalize({ navigate });
          return;
        }
        router.push("/sign-in");
        return;
      }

      // A first factor is still owed and it is not an enterprise redirect —
      // there is nothing this route can do about that, the form can.
      if (
        signIn.status === "needs_first_factor" &&
        !signIn.supportedFirstFactors?.every(
          (factor) => factor.strategy === "enterprise_sso",
        )
      ) {
        router.push("/sign-in");
        return;
      }

      if (signIn.isTransferable) {
        await signUp.create({ transfer: true });
        if (signUp.status === "complete") {
          await signUp.finalize({ navigate });
          return;
        }
        // Something is still missing on the new account; the sign-up form reads
        // the same attempt and will ask for exactly what is left.
        router.push("/sign-up");
        return;
      }

      if (signUp.status === "complete") {
        await signUp.finalize({ navigate });
        return;
      }

      if (
        signIn.status === "needs_second_factor" ||
        signIn.status === "needs_new_password"
      ) {
        router.push("/sign-in");
        return;
      }

      const sessionId =
        signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
      if (sessionId) {
        await clerk.setActive({ session: sessionId, navigate });
        return;
      }

      // Every branch above declined it. Better a way out than a spinner that
      // never stops.
      setFailed(true);
    })();
  }, [clerk, signIn, signUp, router]);

  if (failed) {
    return (
      <AuthShell
        eyebrow="Sign in"
        title="That didn't go through"
        description="We couldn't finish signing you in with that provider. It may have been cancelled, or the link may have expired."
      >
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/sign-in" />}
        >
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <Swirling className="size-6 text-muted-foreground" />
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        Signing you in
      </p>
      {/* Bot protection can be required when the transfer above mints an
          account, and Clerk needs somewhere to put it. */}
      <div id="clerk-captcha" className="empty:hidden" />
    </div>
  );
}
