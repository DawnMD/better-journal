// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { callerFor, USER_A } from "../helpers/db";

/**
 * Creating a journal from the dialog.
 *
 * The form validates with react-hook-form through @hookform/resolvers' zod
 * resolver, then calls `createJournal` and takes the user into the new journal.
 * The oRPC client is the real router, run as a signed-in user against the test
 * database — the same `globalThis.$client` hook the server render uses — so a
 * valid submit really creates the journal. Only Next's router is stubbed.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// React only batches `act` updates when told it is running under a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let CreateJournalDialog: typeof import("@/components/create-journal-dialog").CreateJournalDialog;

beforeAll(async () => {
  // Before the dialog imports the oRPC client, which reads `$client` once.
  globalThis.$client = callerFor(USER_A);
  ({ CreateJournalDialog } = await import("@/components/create-journal-dialog"));
});

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  push.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CreateJournalDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

/** Types into a React-controlled field the way a user would. */
function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(field);
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function titleField() {
  return document.getElementById("journal-title") as HTMLInputElement;
}

async function submit() {
  const form = document.getElementById("create-new-journal") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("create journal dialog", () => {
  it("rejects a title shorter than five characters", async () => {
    await act(async () => type(titleField(), "Dia"));
    await submit();

    expect(document.body.textContent).toContain(
      "Journal title must be at least 5 characters.",
    );
    expect(titleField().getAttribute("aria-invalid")).toBe("true");
    expect(await callerFor(USER_A).journalRouter.getAllJournal()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects a title longer than 32 characters", async () => {
    await act(async () => type(titleField(), "x".repeat(33)));
    await submit();

    expect(document.body.textContent).toContain(
      "Journal title must be at most 32 characters.",
    );
    expect(await callerFor(USER_A).journalRouter.getAllJournal()).toHaveLength(0);
  });

  it("creates the journal and opens it", async () => {
    await act(async () => type(titleField(), "Travel log"));
    const description = document.getElementById(
      "journal-description",
    ) as HTMLTextAreaElement;
    await act(async () => type(description, "Trips, mostly by train."));
    await submit();

    await vi.waitFor(() => expect(push).toHaveBeenCalled());

    const journals = await callerFor(USER_A).journalRouter.getAllJournal();
    expect(journals).toHaveLength(1);
    expect(journals[0]).toMatchObject({
      title: "Travel log",
      description: "Trips, mostly by train.",
    });
    expect(push).toHaveBeenCalledWith(`/journal/${journals[0].id}`);
  });
});
