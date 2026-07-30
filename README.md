# Better Journal

[![CI](https://github.com/DawnMD/better-journal/actions/workflows/ci.yml/badge.svg)](https://github.com/DawnMD/better-journal/actions/workflows/ci.yml)

A private journaling app built around the question *"what did I actually write this year?"* — a rich-text editor with autosave, full-text search across every entry, password-protected journals, and a dashboard that turns a year of writing into streaks, a contribution heatmap, and word counts. Optional AI insights can summarise a week, label the mood of an entry, and answer questions about your own writing.

> **Screenshot:** run `pnpm db:seed -- --user <your-clerk-id>` then `pnpm dev` and capture `/dashboard`. Save it to `docs/dashboard.png` and reference it here — the seeded dataset spans six months, so the heatmap and charts have real shape.

---

## The stack, and why

| Choice | Why this and not the obvious alternative |
|---|---|
| **oRPC** over tRPC | Same end-to-end type inference, but procedures are plain objects with a standard `.input()/.handler()` shape rather than a builder chain, and it speaks OpenAPI natively — so the same router could serve a public REST surface later without a rewrite. |
| **Plate** over a textarea | Journals want headings, quotes and emphasis. Plate stores a structured document rather than a string, which is what makes Markdown export lossless and lets the search layer extract clean plain text instead of stripping HTML. |
| **Clerk** over rolling auth | Session handling, MFA and account recovery are a large surface to get subtly wrong, and none of it is what makes this app interesting. The app never sees a password. |
| **Postgres full-text search** over a search service | A generated `tsvector` column with a GIN index gives stemming, ranking and highlighted snippets with no second datastore to run, sync, or pay for. Reaching for Elasticsearch at this scale would be infrastructure cosplay. |
| **Hand-rolled SVG charts** over Recharts | The dashboard is one line path, an area wash, and a hover layer. A charting library would be more dependency than drawing, and hand-rolling keeps the marks exactly to spec. |

Also: Next.js 16 (App Router, React Compiler), Prisma 7, TanStack Query, Tailwind v4, shadcn/ui on Base UI.

---

## Architecture

### End-to-end typed RPC

`server/router/*` defines procedures; `AppRouter` is a plain type export. The client imports that type — never the implementation — so a renamed field or changed return shape is a compile error at the call site, not a runtime surprise.

```
server/router/  ──►  AppRouter (type only)  ──►  lib/orpc.query.ts  ──►  components
     │                                                  │
     └── protectedProcedure ── assertJournalOwned        └── TanStack Query keys,
         (auth + ownership + unlock, one place)              prefetched server-side
```

Server components prefetch into a `QueryClient` and dehydrate it, so the first paint has data and the client's `useSuspenseQuery` reads from cache instead of refetching.

### Authorization is a query predicate, not an `if`

Every ownership check is part of the database query rather than a check on its result:

```ts
const { count } = await db.note.updateMany({
  where: { id: noteId, journal: { userId, trash: false } },
  data: { content },
});
if (count === 0) throw new ORPCError("NOT_FOUND");
```

One round trip, and no window in which the journal could change hands between the check and the write. Someone else's resource returns `NOT_FOUND` rather than `FORBIDDEN`, so ids can't be enumerated by probing which ones come back 403.

### Password-protected journals

The part worth doing properly. A client-side `unlocked` boolean would be theatre — the RPC endpoints are directly callable, so anyone could skip the dialog.

Instead, verifying the password mints a short-lived HMAC token scoped to **one journal and one user**, stored in an HttpOnly cookie:

```
journalId.userId.expiresAt.signature
```

The expiry is *inside* the signed payload, so editing the cookie to extend it invalidates the signature. `assertUnlocked` re-checks on every request, and it takes the password hash as an argument so callers that are already reading the row check the lock without a second query.

The subtle part: `saveNote`, `renameNote`, `deleteNote` and `getNoteById` reach a note by its own id and never mention the journal, so their scoped writes originally sailed straight past the lock. Closing that is what makes the feature real, and there's a test for each path.

### Timezones

`Note.createdAt` is a `TIMESTAMP(3)` holding UTC, so UTC is the source of truth for *storage*. But "which day did I write this on" is a question about the reader's calendar — a note written at 02:00 IST is stored at 20:30 UTC the previous day, and bucketing it in the server's zone files it under the wrong date.

So the zone is an explicit input from the client, and every day boundary goes through `server/lib/day-window.ts`. In SQL that means:

```sql
("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $tz)::date
```

Both casts are load-bearing. A single `AT TIME ZONE` reads the naive stored value as though it were *already* local and shifts it the wrong way.

---

## Local setup

**Prerequisites:** Node 22+, pnpm, and a Postgres 16 instance.

```bash
pnpm install                      # runs `prisma generate` via postinstall
cp .env.example .env.local        # then fill in DATABASE_URL + Clerk keys
pnpm db:migrate                   # apply migrations
pnpm dev
```

`.env.example` documents every variable `env.ts` validates. The app fails fast at boot on a missing required one, so an empty value beats a wrong one.

### Seed data

The dashboard, search, and AI features are all hard to evaluate against an empty database:

```bash
pnpm db:seed -- --user user_2abc...    # 3 journals, ~250 entries over 180 days
pnpm db:seed -- --normalize            # backfill plainText / repair legacy rows
```

Find your Clerk user id in the Clerk dashboard. The generator is seeded, so reruns produce the same dataset.

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` | Run / build |
| `pnpm lint` · `pnpm typecheck` | ESLint · `tsc --noEmit` |
| `pnpm test` | Vitest against a real Postgres |
| `pnpm db:migrate` · `pnpm db:studio` | Apply migrations · Prisma Studio |

---

## Tests

148 tests, run against a **real Postgres** rather than a mocked Prisma client. That is the whole point: the bugs worth catching here live in relation filters, `updateMany` predicates, and timezone-shifted `GROUP BY` — none of which a mock evaluates. A mocked test proves you called Prisma, not that the query is correct.

`tests/global-setup.ts` creates and migrates a throwaway database; each test truncates. Procedures are called directly through `createRouterClient(router, { context: { db, userId } })`, so the real middleware chain runs with no HTTP layer to stand up.

What's covered:

- **Cross-tenant access** — every id-taking procedure, asserting user B gets `NOT_FOUND` for user A's resource.
- **Locked journals** — every note-by-id path refuses; token forgery, cross-journal reuse, cross-user reuse, and expiry extension all fail.
- **Timezones** — DST-boundary day windows (23h and 25h), half-hour and 45-minute offsets, and list-vs-badge agreement across five zones.
- **Search** — stemming, title-over-body ranking, prefix matching, and tsquery operator input that would otherwise 500.
- **The AI gate** — every AI procedure refuses with no key present, which is how CI runs.

CI runs lint → typecheck → test → build against a `postgres:16` service container on every push and PR.

---

## AI insights (optional)

Off unless `AI_INSIGHTS_ENABLED=true` **and** `ANTHROPIC_API_KEY` are both set. The app builds, runs, and passes its full test suite with neither — the panels simply don't render and the procedures return `NOT_IMPLEMENTED`.

The gate is server-side. `NEXT_PUBLIC_AI_INSIGHTS_ENABLED` only hides UI; it ships in the browser bundle where anyone can flip it, so it is explicitly not the access control.

Three features, all on `claude-opus-5`: a weekly summary (themes, tone, a short reflection), per-entry theme and mood extraction stored on the note so the dashboard can chart mood over time, and a streaming "ask your journal" chat over a bounded date range.

Notes on the integration, since they're easy to get wrong:

- Structured output uses a **hand-written JSON Schema**, not the SDK's zod helper — this repo has a live zod-version skew, and adding a second version constraint to that path would be asking for the original build break again.
- `stop_reason === "refusal"` is checked **before** `content` is read. On a refusal `content` is empty, so indexing `content[0]` throws a `TypeError` instead of surfacing the reason.
- The prompt cache breakpoint sits after the system prompt and entries and before the varying question. `usage.cache_read_input_tokens` is logged — zero across repeat asks means something in the prefix is varying.
- Entries are put directly in context (Opus 5 has a 1M-token window). **pgvector RAG is the next step if entry volume outgrows that** — building a vector store before there's a corpus to justify it would be speculative.

Rate limiting is a Postgres row unique on `(userId, day)`, so concurrent requests can't both read the same count. No Redis for one integer.

---

## What I'd do next

- **Playwright E2E.** The router layer is well covered; the browser path (sign in → write → autosave → reload) is not. `@clerk/testing` makes the auth part tractable.
- **PDF export.** Markdown and JSON ship; PDF needs a headless browser or a LaTeX toolchain in the deploy image, and Markdown converts with any tool you already have.
- **Offline drafts.** Autosave assumes connectivity. An IndexedDB queue that flushes on reconnect would make the app usable on a train.
- **pgvector for AI.** Only once someone's corpus outgrows the context window.
- **Shared journals.** The schema is single-owner throughout; collaboration means a join table and revisiting every `assertJournalOwned` call — worth doing deliberately rather than bolting on.
