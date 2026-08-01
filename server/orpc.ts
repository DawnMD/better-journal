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
