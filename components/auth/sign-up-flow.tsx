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
import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Create an account: email and password, then a code to prove the email.
 *
 * The shape of the second step is not a choice — Clerk answers the first call
 * with what is still missing, and the guide's test for "show the code form" is
 * exactly the one below: the address is unverified and nothing else is
 * outstanding. Reading it back off the resource rather than tracking a step
 * counter is what keeps this honest when the instance's settings change.
 *
 * First and last name are collected because the rest of the app shows them —
 * the account menu is a full name and a pair of initials — and left optional
 * because only the instance knows whether it wants them. Blank ones are dropped
 * rather than sent as empty strings.
 */
export function SignUpFlow() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const pending = fetchStatus === "fetching";
  const finalize = () =>
    signUp.finalize({ navigate: navigateAfterAuth(router) });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const { error } = await signUp.password({
      emailAddress: email.trim(),
      password,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
    if (error) return;

    // An instance that does not verify email addresses is done right here.
    if (signUp.status === "complete") {
      await finalize();
      return;
    }

    await signUp.verifications.sendEmailCode();
  }

  async function handleVerify(code: string) {
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) return;

    if (signUp.status === "complete") {
      await finalize();
    }
  }

  const needsEmailCode =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  if (needsEmailCode) {
    return (
      <AuthShell
        eyebrow="Verify"
        title="Check your email"
        description={`We sent a code to ${signUp.emailAddress ?? email}. It is good for ten minutes.`}
      >
        <div className="flex flex-col gap-5">
          <AuthError errors={errors.global} />
          <VerificationForm
            pending={pending}
            error={errors.fields.code}
            onSubmit={handleVerify}
            onResend={() => signUp.verifications.sendEmailCode()}
            submitLabel="Create account"
            footer={
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-muted-foreground"
                onClick={() => signUp.reset()}
              >
                Use a different email
              </Button>
            }
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Sign up"
      title="Start writing things down"
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OAuthButtons />
        <AuthSeparator>or</AuthSeparator>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <AuthError errors={errors.global} />

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.fields.firstName}>
                <FieldLabel htmlFor="first-name">First name</FieldLabel>
                <Input
                  id="first-name"
                  name="first-name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  aria-invalid={!!errors.fields.firstName}
                  className="h-9"
                />
                {errors.fields.firstName && (
                  <FieldError errors={[errors.fields.firstName]} />
                )}
              </Field>

              <Field data-invalid={!!errors.fields.lastName}>
                <FieldLabel htmlFor="last-name">Last name</FieldLabel>
                <Input
                  id="last-name"
                  name="last-name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  aria-invalid={!!errors.fields.lastName}
                  className="h-9"
                />
                {errors.fields.lastName && (
                  <FieldError errors={[errors.fields.lastName]} />
                )}
              </Field>
            </div>

            <Field data-invalid={!!errors.fields.emailAddress}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={!!errors.fields.emailAddress}
                className="h-9"
              />
              {errors.fields.emailAddress && (
                <FieldError errors={[errors.fields.emailAddress]} />
              )}
            </Field>

            <Field data-invalid={!!errors.fields.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
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
            Create account
          </Button>

          {/* Where Clerk mounts its bot-protection widget, if the instance has
              one turned on. Must be in the DOM before `signUp.password()` runs,
              and stays invisible when it is not needed. */}
          <div id="clerk-captcha" className="empty:hidden" />
          {errors.fields.captcha && (
            <FieldError errors={[errors.fields.captcha]} />
          )}
        </form>
      </div>
    </AuthShell>
  );
}
