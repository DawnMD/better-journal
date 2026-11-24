import DashboardPage from "@/app/(main-app)/dashboard/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The dashboard's static shell.
 *
 * With Partial Prefetching the App Shell is served before the request has been
 * read, so the heading and the three widget skeletons must render without the
 * session, the `tz` cookie or any stats. Here the request never answers: what
 * still renders is exactly what the shell holds.
 */

const { never } = vi.hoisted(() => ({
  never: () => new Promise<never>(() => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: Object.assign(never, { protect: never }),
}));

vi.mock("next/headers", () => ({
  cookies: never,
  headers: never,
}));

function renderShell() {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe("the dashboard shell", () => {
  it("renders the heading before the request is read", () => {
    expect(renderShell()).toContain("Your year so far");
  });

  it("renders a skeleton for each of the three widgets", () => {
    const html = renderShell();

    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(3);
    expect(html).not.toContain("Longest");
  });
});
