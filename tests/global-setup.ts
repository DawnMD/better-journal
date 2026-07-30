import "./load-env";
import { execSync } from "node:child_process";
import { Client } from "pg";

/**
 * Creates the test database if needed, then brings it up to the current schema.
 *
 * Runs once for the whole suite. The tests exercise real Prisma queries against
 * real Postgres — relation filters, `updateMany` predicates, timezone-shifted
 * `GROUP BY` — none of which a mocked client would evaluate. Mocking here would
 * test that we called Prisma, not that the query is correct, which is precisely
 * the class of bug these tests exist to catch.
 */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env.local and point " +
        "it at a throwaway database — the suite truncates every table between tests.",
    );
  }

  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);

  if (!dbName) {
    throw new Error(`TEST_DATABASE_URL has no database name: ${url}`);
  }

  await ensureDatabase(parsed, dbName);

  // `migrate deploy` rather than `db push`: it applies the same migration files
  // production will get, so a broken hand-written migration (the tsvector one,
  // for instance) fails here rather than on deploy.
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      // prisma.config.ts picks the unpooled URL when VERCEL === "1"; make sure
      // neither is inherited from a real deployment env.
      VERCEL: "",
    },
  });
}

/** Connects to the maintenance database to CREATE DATABASE if it is missing. */
async function ensureDatabase(parsed: URL, dbName: string) {
  const admin = new URL(parsed.toString());
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const { rows } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );

    if (rows.length === 0) {
      // Identifier, so it cannot be a bind parameter. dbName comes from our own
      // env file, and the quoting handles the rest.
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`[tests] created database ${dbName}`);
    }
  } finally {
    await client.end();
  }
}
