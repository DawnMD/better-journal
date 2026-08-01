# Better Journal

[![CI](https://github.com/DawnMD/better-journal/actions/workflows/ci.yml/badge.svg)](https://github.com/DawnMD/better-journal/actions/workflows/ci.yml)

A private journaling app built around the question *"what did I actually write this year?"* — a rich-text editor with autosave, full-text search across every entry, password-protected journals, and a dashboard that turns a year of writing into streaks, a contribution heatmap, and word counts.

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
         (auth + ownership, one place)                       prefetched server-side
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

### Timezones

`Note.createdAt` is a `TIMESTAMP(3)` holding UTC, so UTC is the source of truth for *storage*. But "which day did I write this on" is a question about the reader's calendar — a note written at 02:00 IST is stored at 20:30 UTC the previous day, and bucketing it in the server's zone files it under the wrong date.

So the zone is an explicit input from the client, and every day boundary goes through `server/lib/day-window.ts`. In SQL that means:

```sql
("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $tz)::date
```

Both casts are load-bearing. A single `AT TIME ZONE` reads the naive stored value as though it were *already* local and shifts it the wrong way.

The calendar goes one step further and never asks the browser *where* a note goes at all. `getNotesInRange` labels every note with the `day` cell and the `minutes` offset it belongs at, computed once in the zone the query was made in. The client groups by that label rather than reading `createdAt` through a local `Date` getter — which would answer for the browser's zone, and the two are only usually the same.

### The calendar

Month, week and day, built on the range query above rather than a component library. One read backs all three — a month grid is 42 days, a week is 7, a day is 1 — so switching view or paging is a single round trip.

Per-day counts are not a separate aggregate any more. The grid has the notes, so it counts them, and a badge that contradicts the cell under it stops being expressible. That disagreement was a real bug: the list bucketed days in the server's zone while the badges were counted client-side in the browser's, and in IST they diverged for anything written before 05:30.

What you are looking at — the selected day and the view — lives in the URL and is derived on every render, so browser back/forward moves the calendar and a day view is linkable. The server prefetches the same range through the same `lib/calendar.ts` helpers the client uses; two implementations of "which days are on screen" would differ by an off-by-one and turn every first paint into a cache miss.

`rangeWindow` caps a request at six weeks. Without it one call could ask for every note a journal has ever held, which is the unbounded read the whole timezone-aware aggregation existed to remove.

### Missing is a 404, not an error

An id that doesn't resolve is an ordinary navigation outcome — a stale bookmark, a journal emptied from trash, someone else's id — so it renders a not-found boundary with a real 404 status rather than "something went wrong".

That decision has to happen on the *server*, which is the one place prefetching gets in the way: `prefetchQuery` swallows its failures, so a page that only prefetches ships a 200 and discovers the journal is gone when the client re-runs the query, by which point an error boundary is the best it can do. So `/journal/[journalId]` and `/journal/[journalId]/[noteId]` **await** the query that establishes existence — the result is cached either way, so hydration is unaffected — and call `notFound()`:

```ts
const journal = await queryClient.fetchQuery(/* getJournalById */);
if (!journal) notFound();
```

Three boundaries, because context is what makes a 404 useful: the root one for unmatched URLs, `(main-app)/not-found.tsx` inside the shell so the sidebar and ⌘K survive a dead journal link, and one scoped to `[noteId]` that offers the way back to its journal. The note page also 404s when the note is real but the journal id in the URL isn't its own — otherwise the note renders under a journal it never belonged to.

The error boundaries keep what's left: a locked journal, an unreachable database. Failures worth a "try again", which a deleted note never is. And 4xx answers are excluded from React Query's retries — three retries with backoff would leave a 404 spinning for seconds before the page could declare it.

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

The dashboard and search are both hard to evaluate against an empty database:

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

226 tests, run against a **real Postgres** rather than a mocked Prisma client. That is the whole point: the bugs worth catching here live in relation filters, `updateMany` predicates, and timezone-shifted `GROUP BY` — none of which a mock evaluates. A mocked test proves you called Prisma, not that the query is correct.

`tests/global-setup.ts` creates and migrates a throwaway database; each test truncates. Procedures are called directly through `createRouterClient(router, { context: { db, userId } })`, so the real middleware chain runs with no HTTP layer to stand up.

What's covered:

- **Cross-tenant access** — every id-taking procedure, asserting user B gets `NOT_FOUND` for user A's resource.
- **Locked journals** — every note-by-id path refuses; token forgery, cross-journal reuse, cross-user reuse, and expiry extension all fail.
- **Timezones** — DST-boundary day windows (23h and 25h), half-hour and 45-minute offsets, and month-grid-vs-day-view agreement across five zones.
- **Calendar geometry** — grid extents, the six-week range cap against `rangeWindow`'s, overlap packing, and query-string params that would otherwise 500 out of `format`.
- **Search** — stemming, title-over-body ranking, prefix matching, and tsquery operator input that would otherwise 500.

CI runs lint → typecheck → test → build against a `postgres:16` service container on every push and PR.

---

## What I'd do next

- **Playwright E2E.** The router layer is well covered; the browser path (sign in → write → autosave → reload) is not. `@clerk/testing` makes the auth part tractable.
- **PDF export.** Markdown and JSON ship; PDF needs a headless browser or a LaTeX toolchain in the deploy image, and Markdown converts with any tool you already have.
- **Offline drafts.** Autosave assumes connectivity. An IndexedDB queue that flushes on reconnect would make the app usable on a train.
- **Shared journals.** The schema is single-owner throughout; collaboration means a join table and revisiting every `assertJournalOwned` call — worth doing deliberately rather than bolting on.
