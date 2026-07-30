import { env } from "@/env";
import { ORPCError, os } from "@orpc/server";
import { Context } from "./context";

/**
 * Request timing sits on `base`, so every procedure gets it.
 *
 * It used to sit on `publicProcedure`, which nothing in the app ever used — so
 * the log never printed. That middleware also injected a random 200–1700ms
 * delay on every call in development, which is a footgun disguised as a
 * loading-state test: it makes real latency regressions invisible. If you want
 * it back, set SLOW_RPC=1 and it applies deliberately.
 */
const withTiming = os.$context<Context>().middleware(async ({ path, next }) => {
  const start = performance.now();

  try {
    return await next();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[oRPC] ${path.join(".")} ${ms}ms`);
  }
});

const withArtificialDelay = os
  .$context<Context>()
  .middleware(async ({ next }) => {
    if (process.env.SLOW_RPC === "1") {
      const delay = Math.floor(Math.random() * 1500) + 200;
      await new Promise((r) => setTimeout(r, delay));
    }

    return next();
  });

export const base = os
  .$context<Context>()
  .use(withTiming)
  .use(withArtificialDelay);

export const publicProcedure = base;

/**
 * Requires AI insights to be both enabled and configured.
 *
 * This is the enforcement point. `NEXT_PUBLIC_AI_INSIGHTS_ENABLED` only hides
 * the UI — it ships in the browser bundle, where anyone can flip it — so the
 * decision has to be re-made server-side on every call.
 *
 * Both conditions are required: the flag says the operator wants the feature on,
 * and the key says it can actually work. A flag without a key would surface as a
 * confusing 500 from the SDK instead of an honest "not available here".
 *
 * NOT_IMPLEMENTED rather than FORBIDDEN: the caller has done nothing wrong and
 * no permission would change the outcome — this deployment simply does not run
 * this feature.
 */
export const aiProcedure = base
  .use(async ({ context, next }) => {
    const user = context.userId;

    if (!user) throw new ORPCError("UNAUTHORIZED");

    if (env.AI_INSIGHTS_ENABLED !== "true" || !env.ANTHROPIC_API_KEY) {
      throw new ORPCError("NOT_IMPLEMENTED", {
        message: "AI insights are not enabled on this deployment.",
      });
    }

    return next({ context: { ...context, userId: user } });
  });

export const protectedProcedure = base.use(async ({ context, next }) => {
  const user = context.userId;

  if (!user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      ...context,
      // Narrowed from `string | null` to `string`, so downstream handlers and
      // assertJournalOwned do not each have to re-check.
      userId: user,
    },
  });
});
