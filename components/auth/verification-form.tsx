"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState } from "react";

/**
 * The one-time-code step.
 *
 * Three flows arrive here — a new device on sign-in, a fresh email address on
 * sign-up, a password reset — and they differ only in which Clerk method
 * verifies the code. That difference stays with the caller; everything the
 * visitor sees is the same, so it is written once.
 *
 * The input is a plain text field with `autoComplete="one-time-code"`, which is
 * what lets iOS and Chrome offer the code straight from the message. A grid of
 * six single-character boxes looks better in a screenshot and quietly breaks
 * that, along with paste on some browsers.
 */
export function VerificationForm({
  label = "Verification code",
  submitLabel = "Continue",
  pending,
  error,
  onSubmit,
  onResend,
  footer,
}: {
  label?: string;
  submitLabel?: string;
  pending: boolean;
  /** The field-level error Clerk returned for `code`, if any. */
  error?: { message: string } | null;
  onSubmit: (code: string) => void | Promise<unknown>;
  /** Omitted for authenticator apps, where there is nothing to re-send. */
  onResend?: () => void | Promise<unknown>;
  /** A way back out — "Use a different account", "Start over". */
  footer?: React.ReactNode;
}) {
  const [code, setCode] = useState("");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(code.trim());
      }}
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="code">{label}</FieldLabel>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={!!error}
          className="h-9 text-center font-mono text-base tracking-[0.4em]"
        />
        {error && <FieldError errors={[error]} />}
      </Field>

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending || code.trim().length === 0}
        >
          {submitLabel}
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {onResend && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              disabled={pending}
              onClick={() => onResend()}
            >
              Send a new code
            </Button>
          )}
          {footer}
        </div>
      </div>
    </form>
  );
}
