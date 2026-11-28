// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { callerFor, USER_A } from "../helpers/db";

/**
 * Full-text search is switched off (#37).
 *
 * The search code is kept so the feature can come back by reverting the mount,
 * but nothing in the signed-in shell may reach it: no button in the top bar and
 * no ⌘K / Ctrl-K palette. The shell is rendered whole — layout and top bar — as
 * a signed-in user against the test database; only Next's router and Clerk are
 * stubbed.
 */

const navigation = vi.hoisted(() => ({
  params: {} as { journalId?: string; noteId?: string },
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isLoaded: true, user: null }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let MainLayout: typeof import("@/app/(main-app)/layout").default;

beforeAll(async () => {
  // Before the shell imports the oRPC client, which reads `$client` once.
  globalThis.$client = callerFor(USER_A);
  ({ default: MainLayout } = await import("@/app/(main-app)/layout"));
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function renderShell(params: typeof navigation.params = {}) {
  navigation.params = params;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <MainLayout params={Promise.resolve({})}>
          <p>page</p>
        </MainLayout>
      </QueryClientProvider>,
    );
  });
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", bubbles: true, ...init }),
    );
  });
}

describe("the signed-in shell, with search switched off", () => {
  it.each([
    ["while browsing", {}],
    ["on a note", { journalId: "journal-1", noteId: "note-1" }],
  ])("shows no search button in the top bar %s", async (_, params) => {
    await renderShell(params);

    expect(
      document.querySelector('header [aria-label="Search notes"]'),
    ).toBeNull();
    expect(document.querySelector("header")?.textContent).not.toContain("⌘K");
  });

  it.each([
    ["⌘K", { metaKey: true }],
    ["Ctrl-K", { ctrlKey: true }],
  ])("opens no search dialog on %s", async (_, modifiers) => {
    await renderShell();

    press(modifiers);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain("page");
  });
});
