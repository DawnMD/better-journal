import { describe, expect, it } from "vitest";
import { callerFor, makeJournal, makeNote, USER_A, USER_B } from "../helpers/db";

const doc = (text: string) => [{ type: "p", children: [{ text }] }];

describe("markdown export", () => {
  it("serialises Plate content to real Markdown", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A, { title: "My Journal" });
    await makeNote(journal.id, {
      title: "Entry one",
      content: [
        { type: "h1", children: [{ text: "A heading" }] },
        {
          type: "p",
          children: [
            { text: "Some " },
            { text: "bold", bold: true },
            { text: " text." },
          ],
        },
        { type: "blockquote", children: [{ text: "A quotation" }] },
      ],
    });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
    });

    expect(result.contentType).toBe("text/markdown");
    expect(result.filename).toMatch(/^my-journal-\d{4}-\d{2}-\d{2}\.md$/);

    // Plate's own serializer, so marks and block types survive.
    expect(result.content).toContain("# My Journal");
    expect(result.content).toContain("## Entry one");
    expect(result.content).toContain("# A heading");
    expect(result.content).toContain("**bold**");
    expect(result.content).toContain("> A quotation");
  });

  it("includes tags and separates entries", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const first = await makeNote(journal.id, {
      title: "First",
      content: doc("one"),
    });
    await makeNote(journal.id, { title: "Second", content: doc("two") });

    await a.tagRouter.addTagToNote({ noteId: first.id, name: "work" });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
    });

    expect(result.content).toContain("`work`");
    expect(result.content).toContain("## First");
    expect(result.content).toContain("## Second");
    expect(result.content).toContain("---");
  });

  it("surfaces the journal description in the header", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A, {
      title: "Work Log",
      description: "What I shipped.",
    });
    await makeNote(journal.id, { content: doc("entry") });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
    });

    expect(result.content).toContain("What I shipped.");
  });

  it("handles an empty note without crashing", async () => {
    // Historic rows hold "" rather than a Plate document; normalizeValue repairs
    // them on the way into the serializer.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    await makeNote(journal.id, { title: "Empty", content: "" as never });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
    });

    expect(result.content).toContain("## Empty");
  });
});

describe("json export", () => {
  it("emits parseable JSON carrying both content shapes", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A, { title: "Data" });
    await makeNote(journal.id, {
      title: "Entry",
      content: doc("hello world"),
      plainText: "hello world",
    });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "json",
    });

    expect(result.contentType).toBe("application/json");
    expect(result.filename).toMatch(/\.json$/);

    const parsed = JSON.parse(result.content);
    expect(parsed.journal.title).toBe("Data");
    expect(parsed.notes).toHaveLength(1);
    // content round-trips into the editor; plainText is for scripts.
    expect(parsed.notes[0].content).toEqual(doc("hello world"));
    expect(parsed.notes[0].plainText).toBe("hello world");
  });
});

describe("export respects range and ownership", () => {
  it("filters to the requested range", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, {
      title: "Old",
      content: doc("old"),
      createdAt: new Date("2026-01-15T12:00:00Z"),
    });
    await makeNote(journal.id, {
      title: "Recent",
      content: doc("recent"),
      createdAt: new Date("2026-07-15T12:00:00Z"),
    });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
      range: { from: "2026-07-01", to: "2026-07-31" },
      timeZone: "UTC",
    });

    expect(result.content).toContain("## Recent");
    expect(result.content).not.toContain("## Old");
  });

  it("includes the boundary days of the range", async () => {
    // The range end is inclusive of the whole final day — dayWindow's `end` is
    // the exclusive start of the next day.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await makeNote(journal.id, {
      title: "Last day",
      content: doc("x"),
      createdAt: new Date("2026-07-31T23:00:00Z"),
    });

    const result = await a.exportRouter.exportJournal({
      journalId: journal.id,
      format: "markdown",
      range: { from: "2026-07-01", to: "2026-07-31" },
      timeZone: "UTC",
    });

    expect(result.content).toContain("## Last day");
  });

  it("refuses another user's journal", async () => {
    const journalA = await makeJournal(USER_A);
    await makeNote(journalA.id, { content: doc("private") });

    await expect(
      callerFor(USER_B).exportRouter.exportJournal({
        journalId: journalA.id,
        format: "markdown",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reports an empty range rather than emitting an empty file", async () => {
    const journal = await makeJournal(USER_A);

    await expect(
      callerFor(USER_A).exportRouter.exportJournal({
        journalId: journal.id,
        format: "markdown",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
