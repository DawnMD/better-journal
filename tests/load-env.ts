import { config } from "dotenv";

/**
 * Loads env files the way Next.js does, which plain `dotenv/config` does not.
 *
 * Next reads `.env.local` ahead of `.env`; bare `dotenv/config` only reads
 * `.env`, so `TEST_DATABASE_URL` (which belongs in the gitignored local file)
 * was invisible to the test runner. `override: false` preserves the
 * first-one-wins precedence, and keeps real CI environment variables — which are
 * already in `process.env` — authoritative over any committed file.
 */
config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });
