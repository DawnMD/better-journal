"use client";

import {
  AuthError,
  AuthSeparator,
  AuthShell,
} from "@/components/auth/auth-shell";
import { navigateAfterAuth } from "@/components/auth/navigate-after-auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { VerificationForm } from "@/components/auth/verification-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The step a sign-in can pause on before it is allowed to complete. `totp` and
 * the two codes are second factors; `client_trust` is Clerk vouching for a
 * device it has not seen before, which it also settles with an email code.
 */
type Challenge = "client_trust" | "email_code" | "phone_code" | "totp";

/** No round trip beats one, and an email code is the slowest way to be sure. */
const SECOND_FACTOR_PREFERENCE = ["totp", "phone_code", "email_code"] as const;

/**
 * Sign in with a password, or with Google/GitHub.
 *
 * `useSignIn()` hands back a live `signIn` resource plus the errors from the
 * last call to it, so this component holds almost no state of its own: what
 * screen to show is read off `signIn.status` after each step, exactly as Clerk's
 * custom-flow guide does. The one thing worth remembering locally is *which*
 * challenge was raised — the status says a second factor is needed, not that we
 * already sent a phone code rather than an email one.
 *
 * `stalled` is the escape hatch. Clerk can return a status this screen has no
 * form for — an admin-forced password change, a first factor nobody enabled a
 * field for — and the guide's answer there is `console.error`. That leaves a
 * visitor pressing a button that silently does nothing, so it becomes a
 * sentence instead.
 */
export function SignInFlow({
  onForgotPassword,
}: {
  /** Hands the typed address up so the reset flow can start pre-filled. */
  onForgotPassword: (email: string) => void;
}) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [stalled, setStalled] = useState<string | null>(null);

  const pending = fetchStatus === "fetching";
  const finalize = () =>
    signIn.finalize({ navigate: navigateAfterAuth(router) });

  // What the attempt itself says it is waiting on, read fresh every render.
  //
  // This is derived rather than remembered because a sign-in can arrive here
  // already half-done — `/sso-callback` hands back an OAuth attempt that still
  // owes a factor, and a password field would be a strange thing to show
  // someone who is well past passwords.
  const owedChallenge: Challenge | null =
    signIn.status === "needs_client_trust"
      ? "client_trust"
      : signIn.status === "needs_second_factor"
        ? (SECOND_FACTOR_PREFERENCE.find((strategy) =>
            signIn.supportedSecondFactors.some((f) => f.strategy === strategy),
          ) ?? null)
        : null;

  // `challenge` pins the screen across the moment the status flips to
  // `complete` and before the navigation lands, so verifying a code does not
  // flash the password form on the way out.
  const activeChallenge = challenge ?? owedChallenge;

  /** Reads the status Clerk just wrote and asks for whatever it still wants. */
  async function advance() {
    if (signIn.status === "complete") {
      await finalize();
      return;
    }

    // An authenticator app already has the code; the other two must send one.
    // Nothing is sent when the attempt arrived pre-owed from elsewhere — the
    // verify screen's resend covers that.
    if (owedChallenge === "client_trust" || owedChallenge === "email_code") {
      const { error } = await signIn.mfa.sendEmailCode();
      if (!error) setChallenge(owedChallenge);
      return;
    }

    if (owedChallenge === "phone_code") {
      const { error } = await signIn.mfa.sendPhoneCode();
      if (!error) setChallenge(owedChallenge);
      return;
    }

    if (owedChallenge === "totp") {
      setChallenge(owedChallenge);
      return;
    }

    setStalled(
      "We couldn't finish signing you in. Try again, or use another method.",
    );
  }

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault();
    setStalled(null);

    const { error } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });
    if (error) return;

    await advance();
  }

  async function handleVerify(code: string) {
    setChallenge(activeChallenge);

    const { error } =
      activeChallenge === "totp"
        ? await signIn.mfa.verifyTOTP({ code })
        : activeChallenge === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code })
          : await signIn.mfa.verifyEmailCode({ code });
    if (error) return;

    if (signIn.status === "complete") {
      await finalize();
    }
  }

  async function startOver() {
    await signIn.reset();
    setChallenge(null);
    setPassword("");
    setStalled(null);
  }

  if (activeChallenge) {
    return (
      <AuthShell
        eyebrow="Verify"
        title="One more step"
        description={
          activeChallenge === "totp"
            ? "Open your authenticator app and enter the code it shows."
            : activeChallenge === "phone_code"
              ? "We sent a code to the phone number on your account."
              : `We sent a code to ${signIn.identifier ?? email}.`
        }
      >
        <div className="flex flex-col gap-5">
          <AuthError errors={errors.global} />
          <VerificationForm
            pending={pending}
            error={errors.fields.code}
            onSubmit={handleVerify}
            // An authenticator app rolls its own code; there is nothing to send.
            onResend={
              activeChallenge === "totp"
                ? undefined
                : activeChallenge === "phone_code"
                  ? () => signIn.mfa.sendPhoneCode()
                  : () => signIn.mfa.sendEmailCode()
            }
            footer={
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={startOver}
              >
                Start over
              </Button>
            }
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Pick up where you left off"
      footer={
        <>
          New here?{" "}
          <Link
            href="/sign-up"
            className="text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons />
        <AuthSeparator>or</AuthSeparator>

        <form className="flex flex-col gap-5" onSubmit={handlePassword}>
          <div className="flex flex-col gap-4">
            <AuthError
              errors={stalled ? [{ message: stalled }] : errors.global}
            />

            <Field data-invalid={!!errors.fields.identifier}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={!!errors.fields.identifier}
                className="h-9"
              />
              {errors.fields.identifier && (
                <FieldError errors={[errors.fields.identifier]} />
              )}
            </Field>

            <Field data-invalid={!!errors.fields.password}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 font-normal text-muted-foreground"
                  onClick={() => onForgotPassword(email.trim())}
                >
                  Forgot password?
                </Button>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={!!errors.fields.password}
                className="h-9"
              />
              {errors.fields.password && (
                <FieldError errors={[errors.fields.password]} />
              )}
            </Field>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            Sign in
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
