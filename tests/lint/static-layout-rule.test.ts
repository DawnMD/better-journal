import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * A layout never reads the request.
 *
 * Layouts are the App Shell, which Partial Prefetching serves as static output
 * and `ensureStatic = 'shell'` requires to stay that way. A layout that reads a
 * cookie, a header or the session turns the shell for every route beneath it
 * into a per-request render. Each page reads those inside its own Suspense
 * boundary instead.
 */

const eslint = new ESLint();

async function ruleIdsFor(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.ruleId);
}

const REQUEST_READS = {
  cookies: `import { cookies } from "next/headers";\nexport const c = cookies;\n`,
  session: `import { auth } from "@clerk/nextjs/server";\nexport const a = auth;\n`,
  readerZoneCookie: `import { readerCalendarFromCookie } from "@/server/lib/reader-calendar";\nexport const r = readerCalendarFromCookie;\n`,
};

describe("the static layout lint rule", () => {
  it.each(Object.entries(REQUEST_READS))(
    "forbids a layout from importing a request read (%s)",
    async (_, source) => {
      expect(await ruleIdsFor(source, "app/layout.tsx")).toContain(
        "no-restricted-imports",
      );
      expect(
        await ruleIdsFor(source, "app/(main-app)/layout.tsx"),
      ).toContain("no-restricted-imports");
    },
  );

  it("still lets a page read the request", async () => {
    expect(
      await ruleIdsFor(REQUEST_READS.readerZoneCookie, "app/(main-app)/trash/page.tsx"),
    ).not.toContain("no-restricted-imports");
  });
});
