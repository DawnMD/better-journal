import HomePage from "@/app/page";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The landing page.
 *
 * `/` is served from the CDN as a static shell, so everything but the three
 * session-dependent calls to action must render before the session is read.
 * Once it is read, the streamed HTML must already carry the right calls to
 * action, so nothing swaps under a signed-in visitor after hydration.
 */

const session = vi.hoisted(() => ({
  read: (): Promise<{ userId: string | null }> => new Promise(() => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => session.read(),
}));

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  session.read = never;
});

async function renderWithSession(userId: string | null) {
  session.read = async () => ({ userId });
  const { prelude } = await prerender(<HomePage />);
  return new Response(prelude).text();
}

describe("the landing page shell", () => {
  it("renders the hero, features and footer before the session is read", () => {
    const html = renderToString(<HomePage />);

    expect(html).toContain("Write it down. Find it again.");
    expect(html).toContain("Everything a journal needs, and nothing else");
    expect(html).toContain("<footer");
  });

  it("never guesses a call to action before the session is read", () => {
    const html = renderToString(<HomePage />);

    for (const cta of [
      "Open your journal",
      "Open journal",
      "Start writing",
      "Get started",
      "Create your journal",
    ]) {
      expect(html).not.toContain(cta);
    }
  });

  it("offers a way into the app when JavaScript never swaps the calls to action in", () => {
    const html = renderToString(<HomePage />);
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";

    expect(noscript).toContain('href="/dashboard"');
  });
});

describe("the landing page's calls to action", () => {
  it("offer a signed-in visitor their journal", async () => {
    const html = await renderWithSession("user_123");

    expect(html).toContain("Open journal");
    expect(html).toContain("Open your journal");
    expect(html).toContain("Welcome back.");
    expect(html).not.toContain("Get started");
    expect(html).not.toContain("Start writing");
    expect(html).not.toContain("Create your journal");
  });

  it("offer a signed-out visitor a new journal", async () => {
    const html = await renderWithSession(null);

    expect(html).toContain("Get started");
    expect(html).toContain("Start writing");
    expect(html).toContain("I already have an account");
    expect(html).toContain("Create your journal");
    expect(html).not.toContain("Open journal");
    expect(html).not.toContain("Open your journal");
  });
});
