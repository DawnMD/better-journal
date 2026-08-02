import { Separator } from "@/components/ui/separator";
import Link from "next/link";

/**
 * The frame every auth screen sits in.
 *
 * `/sign-in` and `/sign-up` are the only screens an unauthenticated visitor
 * sees, so they carry the whole first impression of the app. That is why they
 * are built out of the same parts as the rest of it — `Field`, `Input`,
 * `Button` — instead of a vendor widget wearing a palette. Nothing here knows
 * about Clerk; the flows compose it.
 *
 * Two columns: the form on the left, and a panel on the right that exists to
 * say what the app is for before anyone has seen a word of it. The panel is
 * `hidden` below `lg` — on a phone it would push the form off the fold to make
 * room for decoration, which is the wrong trade — so the small-screen layout is
 * a single centred column and nothing is lost.
 *
 * The form column carries no card. A framed panel inside a half-width column
 * that already has a hard edge beside it reads as a box in a box; the split
 * itself is the frame now.
 *
 * The header repeats the shape `EmptyState` uses, because both are the same
 * moment: a screen with one thing to say. A mono eyebrow classifies the step, a
 * serif line says what it wants, muted prose says why.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  /** Classifier, set in mono: "Sign in", "Verify", "Reset password". */
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** The way to the other flow — never leave a visitor with one door. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col gap-10 px-6 py-10 md:px-10">
        {/* The wordmark is a link, not a heading: the <h1> belongs to the step,
            which is the one thing this screen is actually about. */}
        <Link
          href="/"
          className="self-center font-serif text-lg tracking-tight lg:self-start"
        >
          Better Journal
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="space-y-2">
              <p className="font-mono text-[11px] leading-5 tracking-[0.2em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
              <h1 className="font-serif text-2xl tracking-tight text-balance">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-pretty text-muted-foreground">
                  {description}
                </p>
              )}
            </div>

            {children}

            {footer && (
              <p className="text-sm text-muted-foreground">{footer}</p>
            )}
          </div>
        </div>
      </div>

      <BrandPanel />
    </div>
  );
}

/**
 * The right-hand half: ruled paper and a line about why any of this is worth
 * doing.
 *
 * Drawn rather than photographed. A stock desk-and-coffee shot is the fastest
 * way to make an app look like every other app, and there is no illustration in
 * this repo to reach for — but the theme is already *about* paper, so the panel
 * can just be paper: warm ground, feint rules, a margin line in the clay
 * accent. It is built from the same tokens as everything else, so it follows
 * `.dark` without a second asset.
 *
 * The rules fade out top and bottom through a mask, which is what keeps the
 * texture from reading as a table.
 */
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-muted lg:block">
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_31px,var(--border)_31px,var(--border)_32px)] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 left-20 w-px bg-brand/25 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
      />

      <div className="relative flex h-full flex-col justify-end gap-6 p-14">
        <p className="max-w-md font-serif text-3xl leading-snug tracking-tight text-balance italic">
          Some days are worth a page. Most are worth a line. The point is the
          habit of noticing.
        </p>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Better Journal
        </p>
      </div>
    </div>
  );
}

/**
 * A labelled rule between the OAuth buttons and the password form.
 *
 * `FieldSeparator` would do this, but it is built for a page that fills its
 * width and sets the label's backdrop in a way that has to match whatever the
 * form is sitting on.
 */
export function AuthSeparator({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-5">
      <Separator className="absolute inset-0 top-1/2" />
      <span className="relative mx-auto block w-fit bg-background px-2 font-mono text-[11px] leading-5 tracking-[0.2em] text-muted-foreground uppercase">
        {children}
      </span>
    </div>
  );
}

/**
 * Errors that belong to the attempt rather than to a field.
 *
 * Clerk splits what it returns into `fields` — rendered next to the input that
 * caused them — and `global`, which is everything else: a wrong password, a
 * locked account, the network. Those have nowhere else to go, so they get a
 * banner at the top of the form rather than being swallowed into a console.
 *
 * Typed structurally on purpose: `@clerk/shared` is a transitive dependency and
 * is not resolvable from app code under pnpm's linker.
 */
export function AuthError({
  errors,
}: {
  errors: readonly { message: string }[] | null | undefined;
}) {
  if (!errors?.length) return null;

  return (
    <div
      role="alert"
      className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {errors.length === 1 ? (
        errors[0].message
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {errors.map((error, index) => (
            <li key={index}>{error.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
