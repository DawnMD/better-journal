"use client";

import { AuthError, AuthShell } from "@/components/auth/auth-shell";
import { navigateAfterAuth } from "@/components/auth/navigate-after-auth";
import { VerificationForm } from "@/components/auth/verification-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Forgetting the password.
 *
 * Three steps on one route, not three routes: the whole thing hangs off a
 * single `SignIn` attempt held in Clerk's client, and a real navigation between
 * steps would be a chance to lose it. Which step shows is read off that
 * attempt — `needs_new_password` is Clerk saying the code checked out — with
 * one local flag for the gap before it, where the attempt exists but has
 * nothing to say yet.
 *
 * It lives inside `/sign-in` for the same reason, and because "forgot password"
 * is a detour from signing in rather than a place anyone means to arrive.
 */
export function ResetPasswordFlow({
  initialEmail,
  onCancel,
}: {
  initialEmail: string;
  onCancel: () => void;
}) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [changed, setChanged] = useState(false);

  const pending = fetchStatus === "fetching";

  async function cancel() {
    await signIn.reset();
    onCancel();
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();

    // The code goes to the address on the account, so Clerk has to be told
    // which account this is before there is anything to send it to.
    const { error: createError } = await signIn.create({
      identifier: email.trim(),
    });
    if (createError) return;

    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    if (error) return;

    setCodeSent(true);
  }

  async function verifyCode(code: string) {
    await signIn.resetPasswordEmailCode.verifyCode({ code });
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();

    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      // A forgotten password is as likely to mean a stolen one as a bad memory.
      signOutOfOtherSessions: true,
    });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: navigateAfterAuth(router) });
      return;
    }

    // The password is already changed; something else — a second factor, most
    // likely — still stands between here and a session. Say so and step back.
    setChanged(true);
  }

  const backToSignIn = (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto p-0 text-muted-foreground"
      onClick={cancel}
    >
      Back to sign in
    </Button>
  );

  if (changed) {
    return (
      <AuthShell
        eyebrow="Reset password"
        title="Password changed"
        description="Your new password is saved. Sign in with it to finish — you may be asked for a second factor."
      >
        <Button size="lg" className="w-full" onClick={cancel}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  if (signIn.status === "needs_new_password") {
    return (
      <AuthShell
        eyebrow="Reset password"
        title="Choose a new password"
        description="Signing you out everywhere else, in case the old one is not just forgotten."
      >
        <form className="flex flex-col gap-5" onSubmit={submitPassword}>
          <div className="flex flex-col gap-4">
            <AuthError errors={errors.global} />

            <Field data-invalid={!!errors.fields.password}>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
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

          <div className="flex flex-col items-center gap-3">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={pending}
            >
              Set password
            </Button>
            {backToSignIn}
          </div>
        </form>
      </AuthShell>
    );
  }

  if (codeSent) {
    return (
      <AuthShell
        eyebrow="Reset password"
        title="Check your email"
        description={`We sent a code to ${signIn.identifier ?? email}.`}
      >
        <div className="flex flex-col gap-5">
          <AuthError errors={errors.global} />
          <VerificationForm
            pending={pending}
            error={errors.fields.code}
            onSubmit={verifyCode}
            onResend={() => signIn.resetPasswordEmailCode.sendCode()}
            footer={backToSignIn}
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Forgot your password?"
      description="Tell us the address you signed up with and we'll send a code to reset it."
    >
      <form className="flex flex-col gap-5" onSubmit={sendCode}>
        <div className="flex flex-col gap-4">
          <AuthError errors={errors.global} />

          <Field data-invalid={!!errors.fields.identifier}>
            <FieldLabel htmlFor="reset-email">Email</FieldLabel>
            <Input
              id="reset-email"
              name="reset-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={!!errors.fields.identifier}
              className="h-9"
            />
            {errors.fields.identifier ? (
              <FieldError errors={[errors.fields.identifier]} />
            ) : (
              <FieldDescription>
                Only works for accounts with a password — if you signed up with
                Google or GitHub, use that button instead.
              </FieldDescription>
            )}
          </Field>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            Send code
          </Button>
          {backToSignIn}
        </div>
      </form>
    </AuthShell>
  );
}
