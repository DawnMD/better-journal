import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Only the reader-zone module may ask the browser for its zone.
 *
 * Everywhere else gets the reader zone from `useReaderZone()`. A component that
 * reads `Intl` directly during render answers with the Node process's zone on
 * the server — UTC on Vercel — and disagrees with the server prefetch, which is
 * exactly the bug the reader-zone provider exists to prevent.
 */

const READS_BROWSER_ZONE = `
export const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
`;

const eslint = new ESLint();

async function ruleIdsFor(filePath: string) {
  const [result] = await eslint.lintText(READS_BROWSER_ZONE, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("the reader-zone lint rule", () => {
  it("forbids reading the browser zone outside the reader-zone module", async () => {
    expect(await ruleIdsFor("components/calendar/some-component.tsx")).toContain(
      "no-restricted-syntax",
    );
    expect(await ruleIdsFor("lib/some-helper.ts")).toContain(
      "no-restricted-syntax",
    );
  });

  it("allows it inside the reader-zone module", async () => {
    expect(await ruleIdsFor("components/reader-zone.tsx")).not.toContain(
      "no-restricted-syntax",
    );
  });
});
