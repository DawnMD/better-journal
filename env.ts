import { createEnv } from "@t3-oss/env-nextjs";
import { vercel, neonVercel } from "@t3-oss/env-nextjs/presets-zod";
import * as z from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string(),
    DATABASE_URL: z.string(),
    // Direct (non-pooled) connection, read by prisma.config.ts for migrations.
    DATABASE_URL_UNPOOLED: z.string().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]),

    // AI insights. Both optional: the app must build and run with neither set,
    // which is what keeps the feature genuinely opt-in rather than a soft
    // requirement. The server-side gate in server/orpc.ts requires the flag to
    // be "true" AND the key to be present.
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_INSIGHTS_ENABLED: z.enum(["true", "false"]).default("false"),

    // Signing key for journal unlock cookies. Optional so the app boots without
    // it; server/lib/unlock.ts falls back to a per-process key and warns in
    // production.
    UNLOCK_TOKEN_SECRET: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string(),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string(),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string(),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),

    // Hides the AI panels without a roundtrip. Convenience only — anyone can set
    // this to "true" in a built bundle, so it is NOT the access control. The
    // enforcement is aiProcedure in server/orpc.ts.
    NEXT_PUBLIC_AI_INSIGHTS_ENABLED: z.enum(["true", "false"]).default("false"),
  },
  // If you're using Next.js < 13.4.4, you'll need to specify the runtimeEnv manually
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NODE_ENV: process.env.NODE_ENV,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_INSIGHTS_ENABLED: process.env.AI_INSIGHTS_ENABLED,
    NEXT_PUBLIC_AI_INSIGHTS_ENABLED: process.env.NEXT_PUBLIC_AI_INSIGHTS_ENABLED,
    UNLOCK_TOKEN_SECRET: process.env.UNLOCK_TOKEN_SECRET,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  extends: [vercel(), neonVercel()],
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  // experimental__runtimeEnv: {
  //   NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
  // }
});
