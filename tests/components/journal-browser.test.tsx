// @vitest-environment happy-dom
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { callerFor, makeJournal, makeNote, USER_A } from "../helpers/db";

/**
 * The journal page: a note list to browse back through, beside a month-only
 * calendar that marks the days with notes. Rendered against the test database
 * as a signed-in user; only Next's router is stubbed.
 *
 * Scrolling (the calendar following the list, infinite loading, restoring the
 * position on Back) needs real layout, which happy-dom does not do, so it is
 * checked in a browser instead.
 */

const navigation = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: navigation.replace,
    refresh: vi.fn(),
  }),
  usePathname: () => "/journal/j",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let JournalBrowser: typeof import("@/components/journal/journal-browser").JournalBrowser;
let ReaderZoneProvider: typeof import("@/components/reader-zone").ReaderZoneProvider;

beforeAll(async () => {
  globalThis.$client = callerFor(USER_A);
  ({ JournalBrowser } = await import("@/components/journal/journal-browser"));
  ({ ReaderZoneProvider } = await import("@/components/reader-zone"));
});

let root: Root | undefined;

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
  vi.useFakeTimers({ now: new Date("2026-07-31T12:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function renderJournal(journalId: string) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <ReaderZoneProvider initialZone="UTC">
          <Suspense fallback={<p>loading</p>}>
            <JournalBrowser journalId={journalId} />
          </Suspense>
        </ReaderZoneProvider>
      </QueryClientProvider>,
    );
  });

  await vi.waitFor(() => {
    expect(document.body.textContent).not.toContain("loading");
  });
}

const list = () => document.querySelector('[aria-label="Notes"]');
const calendar = () => document.querySelector('[aria-label="Calendar"]');
const dayButton = (label: string) =>
  calendar()?.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);

describe("the journal page", () => {
  it("lists every note newest first under month headers, beside a month calendar", async () => {
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      title: "Lake walk",
      plainText: "Cold water, warm sun.",
      createdAt: new Date("2026-06-12T09:00:00Z"),
    });
    await makeNote(journal.id, {
      title: "Market day",
      createdAt: new Date("2026-07-30T09:00:00Z"),
    });

    await renderJournal(journal.id);

    await vi.waitFor(() => {
      const text = list()?.textContent ?? "";
      expect(text.indexOf("July 2026")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("July 2026")).toBeLessThan(text.indexOf("Market day"));
      expect(text.indexOf("Market day")).toBeLessThan(text.indexOf("June 2026"));
      expect(text.indexOf("June 2026")).toBeLessThan(text.indexOf("Lake walk"));
      expect(text).toContain("Cold water, warm sun.");
    });
    // A month grid, with no week or day views to switch to.
    expect(calendar()?.textContent).toContain("July 2026");
    expect(document.body.textContent).not.toMatch(/\bWeek\b/);
  });

  it("jumps the list to a day with notes, and leaves empty days inert", async () => {
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, {
      title: "Market day",
      createdAt: new Date("2026-07-30T09:00:00Z"),
    });

    await renderJournal(journal.id);

    await vi.waitFor(() =>
      expect(dayButton("Thursday, July 30, 2026")).toBeTruthy(),
    );
    // Nothing on the 29th, so nothing to click.
    expect(dayButton("Wednesday, July 29, 2026")).toBeFalsy();

    act(() => dayButton("Thursday, July 30, 2026")!.click());

    expect(navigation.replace).toHaveBeenCalledWith(
      "/journal/j?date=2026-07-30",
      { scroll: false },
    );
  });
});
