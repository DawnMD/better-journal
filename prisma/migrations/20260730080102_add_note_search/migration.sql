-- Full-text search over notes.
--
-- Hand-written rather than Prisma-generated: Prisma cannot express
-- `GENERATED ALWAYS AS (...) STORED`, so it emitted a plain `tsvector` column
-- that nothing would ever populate. A generated column is the right tool here --
-- Postgres keeps it in step with title/plainText on every write, so the index can
-- never drift from the row the way a trigger or an application-maintained column
-- can.

-- `plainText` holds the Plate document flattened to text. Indexing that is much
-- simpler and faster than indexing the JSON: no jsonb traversal at query time.
-- It is maintained by lib/plate.ts on every save.
ALTER TABLE "Note" ADD COLUMN "plainText" TEXT;

-- Weighted so a note whose *title* matches outranks one that merely mentions the
-- term in the body. The 'english' config gives stemming, so "running" finds "ran".
ALTER TABLE "Note" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("plainText", '')), 'B')
  ) STORED;

-- GIN, not GiST: slower to update, substantially faster to search, and journal
-- entries are read far more often than they are written.
CREATE INDEX "Note_searchVector_idx" ON "Note" USING GIN ("searchVector");

-- Existing rows have a NULL plainText and so are not searchable until backfilled.
-- That runs in TypeScript rather than SQL:
--
--   pnpm db:seed -- --normalize
--
-- deliberately, so there is exactly one implementation of "flatten a Plate
-- document to text" (lib/plate.ts). A jsonb_path_query version here would be a
-- second one, free to disagree with the first.
