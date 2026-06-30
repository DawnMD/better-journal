import { ORPCError, os } from "@orpc/server";
import { Context } from "./context";

export const base = os.$context<Context>();

export const publicProcedure = base
  .use(async ({ next }) => {
    if (process.env.NODE_ENV === "development") {
      const delay = Math.floor(Math.random() * 1500) + 200;

      await new Promise((r) => setTimeout(r, delay));
    }

    return next();
  })
  .use(async ({ path, next }) => {
    const start = performance.now();

    const result = await next();

    console.log(`[oRPC] ${path.join(".")} took ${performance.now() - start}ms`);

    return result;
  });

export const protectedProcedure = base.use(async ({ context, next }) => {
  const user = context.userId;

  if (!user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      ...context,
      userId: user,
    },
  });
});
