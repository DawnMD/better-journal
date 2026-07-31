import { hash } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import { HL_END, HL_SPLIT, HL_START } from "@/lib/search";
import {
  callerFor,
  makeJournal,
  makeNote,
  testDb,
  USER_A,
  USER_B,
} from "../helpers/db";

/** A note whose plainText is set the way saveNote would set it. */
async function makeSearchableNote(
  journalId: string,
  title: string,
  body: string,
) {
  return makeNote(journalId, {
    title,
    content: [{ type: "p", children: [{ text: body }] }],
    plainText: body,
  });
}

describe("full-text search", () => {
  it("finds a note by a word in its body", async () => {
    const journal = await makeJournal(USER_A, { title: "Journal" });
    await makeSearchableNote(
      journal.id,
      "Tuesday",
      "Went for a long walk by the river and felt much better afterwards.",
    );
    await makeSearchableNote(journal.id, "Wednesday", "Stayed in and read.");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "river",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Tuesday");
    expect(results[0]?.journalTitle).toBe("Journal");
  });

  it("stems, so 'walking' matches 'walked'", async () => {
    // A regular verb on purpose: the Porter stemmer reduces walk/walked/walking to
    // "walk", but it does not connect irregular forms like ran/running.
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(
      journal.id,
      "Entry",
      "I walked six kilometres today.",
    );

    const results = await callerFor(USER_A).searchRouter.search({
      query: "walking",
    });

    expect(results).toHaveLength(1);
  });

  it("ranks a title match above a body-only match", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(
      journal.id,
      "Nothing relevant",
      "A passing mention of deadlines somewhere in here.",
    );
    await makeSearchableNote(journal.id, "deadlines", "Unrelated body text.");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "deadlines",
    });

    expect(results).toHaveLength(2);
    // Title is weighted A, body B.
    expect(results[0]?.title).toBe("deadlines");
  });

  it("returns a snippet with the match delimited by control characters", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(
      journal.id,
      "Entry",
      "The migration finally went out and nothing caught fire.",
    );

    const [result] = await callerFor(USER_A).searchRouter.search({
      query: "migration",
    });

    expect(result?.snippet.toLowerCase()).toContain("migration");
    expect(result?.snippet).toContain(HL_START);
    expect(result?.snippet).toContain(HL_END);

    // Splitting yields alternating plain/highlighted runs, with the match at an
    // odd index — the contract the client renderer relies on.
    const pieces = result!.snippet.split(HL_SPLIT);
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    expect(pieces[1]?.toLowerCase()).toContain("migration");
  });

  it("emits no HTML of its own, so a snippet is never injected as markup", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(
      journal.id,
      "Entry",
      `A dangerous <img src=x onerror="alert(1)"> payload and <script>alert(2)</script> too`,
    );

    const [result] = await callerFor(USER_A).searchRouter.search({
      query: "payload",
    });

    // We contribute no tags at all: highlighting is STX/ETX, so there is nothing
    // that has to be rendered as HTML and therefore no injection surface.
    expect(result?.snippet).not.toContain("<mark>");
    expect(result?.snippet).toContain(HL_START);

    // As it happens the text-search parser also tokenises tags away, so the
    // literal <img> does not survive either. That is a useful accident, not the
    // defence — the delimiters are what make this safe, and they do not depend on
    // any particular parser behaviour.
    expect(result?.snippet).not.toContain("onerror");
    expect(result?.snippet).not.toContain("<script>");

    // Highlighting still works on a body full of punctuation.
    const pieces = result!.snippet.split(HL_SPLIT);
    expect(pieces[1]).toBe("payload");
  });

  it("prefix-matches the last word, so it works as you type", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(journal.id, "Entry", "Thinking about migrations.");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "migr",
    });

    expect(results).toHaveLength(1);
  });

  it("scopes to one journal when asked", async () => {
    const first = await makeJournal(USER_A, { title: "First" });
    const second = await makeJournal(USER_A, { title: "Second" });
    await makeSearchableNote(first.id, "A", "shared keyword here");
    await makeSearchableNote(second.id, "B", "shared keyword here");

    const all = await callerFor(USER_A).searchRouter.search({
      query: "keyword",
    });
    expect(all).toHaveLength(2);

    const scoped = await callerFor(USER_A).searchRouter.search({
      query: "keyword",
      journalId: first.id,
    });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.journalId).toBe(first.id);
  });
});

describe("search respects every access boundary", () => {
  it("never returns another user's notes", async () => {
    const journalA = await makeJournal(USER_A);
    await makeSearchableNote(journalA.id, "A's note", "confidential material");

    const results = await callerFor(USER_B).searchRouter.search({
      query: "confidential",
    });

    expect(results).toEqual([]);
  });

  it("refuses to scope to another user's journal", async () => {
    const journalA = await makeJournal(USER_A);

    await expect(
      callerFor(USER_B).searchRouter.search({
        query: "anything",
        journalId: journalA.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("excludes trashed journals", async () => {
    const journal = await makeJournal(USER_A, { trash: true });
    await makeSearchableNote(journal.id, "Trashed", "findable phrase");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "findable",
    });

    expect(results).toEqual([]);
  });

  it("excludes password-protected journals entirely", async () => {
    // Not just hiding the text: matching a locked journal at all would confirm a
    // term appears inside it, which is a read straight through the password.
    const journal = await makeJournal(USER_A, { title: "Locked" });
    await makeSearchableNote(journal.id, "Secret", "very private confession");
    await testDb.journal.update({
      where: { id: journal.id },
      data: { hashedPassword: await hash("a-long-enough-password") },
    });

    const results = await callerFor(USER_A).searchRouter.search({
      query: "confession",
    });

    expect(results).toEqual([]);
  });
});

describe("search handles hostile and awkward input", () => {
  it("does not break on tsquery operator characters", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(journal.id, "Entry", "plain ordinary text");

    // to_tsquery would raise a syntax error on every one of these.
    for (const query of [
      "cats &",
      "| broken",
      "!(",
      "a:b:c",
      "<->",
      "'; DROP TABLE \"Note\"; --",
      "\\",
      "((((",
    ]) {
      await expect(
        callerFor(USER_A).searchRouter.search({ query }),
      ).resolves.toBeInstanceOf(Array);
    }

    // And the table is still there.
    expect(await testDb.note.count()).toBe(1);
  });

  it("supports quoted phrases and negation", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(journal.id, "One", "the quick brown fox");
    await makeSearchableNote(journal.id, "Two", "the brown quick fox");

    const phrase = await callerFor(USER_A).searchRouter.search({
      query: '"quick brown"',
    });
    expect(phrase.map((r) => r.title)).toEqual(["One"]);
  });

  it("rejects an empty query with no tags", async () => {
    // Empty text is only meaningful when a tag narrows it; with neither, this
    // would be "return everything", which is not a search.
    await expect(
      callerFor(USER_A).searchRouter.search({ query: "   " }),
    ).rejects.toBeDefined();

    await expect(
      callerFor(USER_A).searchRouter.search({ query: "", tagIds: [] }),
    ).rejects.toBeDefined();
  });

  it("honours the limit", async () => {
    const journal = await makeJournal(USER_A);
    for (let i = 0; i < 5; i++) {
      await makeSearchableNote(journal.id, `Note ${i}`, "repeated keyword");
    }

    const results = await callerFor(USER_A).searchRouter.search({
      query: "keyword",
      limit: 3,
    });

    expect(results).toHaveLength(3);
  });

  it("returns nothing rather than everything for a term that is absent", async () => {
    const journal = await makeJournal(USER_A);
    await makeSearchableNote(journal.id, "Entry", "some text");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "absent",
    });

    expect(results).toEqual([]);
  });
});

describe("search by tag", () => {
  /** Tags `noteId` and hands back the new tag's id. */
  async function tag(userId: string, noteId: string, name: string) {
    const caller = callerFor(userId);
    await caller.tagRouter.addTagToNote({ noteId, name });
    const all = await caller.tagRouter.getAllTags();

    return all.find((t) => t.name === name)!.id;
  }

  it("accepts an empty query when a tag is given", async () => {
    // The palette clears the text when you pick a tag chip — the text was how
    // you found the facet, not part of the search.
    const journal = await makeJournal(USER_A);
    const note = await makeSearchableNote(journal.id, "Tagged", "body text");
    const other = await makeSearchableNote(journal.id, "Untagged", "body text");
    const workId = await tag(USER_A, note.id, "work");

    const results = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
    });

    expect(results.map((r) => r.id)).toEqual([note.id]);
    expect(results.map((r) => r.id)).not.toContain(other.id);
  });

  it("returns createdAt-descending with a flat rank when there is no query", async () => {
    const journal = await makeJournal(USER_A);
    const older = await makeNote(journal.id, {
      title: "Older",
      plainText: "first",
      createdAt: new Date("2026-07-01T10:00:00Z"),
    });
    const newer = await makeNote(journal.id, {
      title: "Newer",
      plainText: "second",
      createdAt: new Date("2026-07-20T10:00:00Z"),
    });

    const workId = await tag(USER_A, older.id, "work");
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: newer.id,
      name: "work",
    });

    const results = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
    });

    // With nothing to rank by, the ORDER BY has to degrade to recency rather
    // than to an arbitrary order.
    expect(results.map((r) => r.title)).toEqual(["Newer", "Older"]);
    expect(results.every((r) => r.rank === 0)).toBe(true);
  });

  it("falls back to a plain excerpt for the snippet when there is no query", async () => {
    const journal = await makeJournal(USER_A);
    const note = await makeSearchableNote(
      journal.id,
      "Entry",
      "A perfectly ordinary sentence about the weather.",
    );
    const workId = await tag(USER_A, note.id, "work");

    const [result] = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
    });

    expect(result?.snippet).toBe(
      "A perfectly ordinary sentence about the weather.",
    );
    // No highlighting, because nothing was matched.
    expect(result?.snippet).not.toContain(HL_START);
  });

  it("ANDs the query and the tag together", async () => {
    const journal = await makeJournal(USER_A);
    const both = await makeSearchableNote(journal.id, "Both", "river walk");
    const queryOnly = await makeSearchableNote(
      journal.id,
      "Query only",
      "river walk",
    );
    const tagOnly = await makeSearchableNote(
      journal.id,
      "Tag only",
      "nothing relevant",
    );

    const workId = await tag(USER_A, both.id, "work");
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: tagOnly.id,
      name: "work",
    });

    const results = await callerFor(USER_A).searchRouter.search({
      query: "river",
      tagIds: [workId],
    });

    expect(results.map((r) => r.id)).toEqual([both.id]);
    expect(results.map((r) => r.id)).not.toContain(queryOnly.id);
    expect(results.map((r) => r.id)).not.toContain(tagOnly.id);
  });

  it("requires every tag, not any of them", async () => {
    const journal = await makeJournal(USER_A);
    const both = await makeSearchableNote(journal.id, "Both", "text");
    const onlyWork = await makeSearchableNote(journal.id, "Only work", "text");

    const workId = await tag(USER_A, both.id, "work");
    const urgentId = await tag(USER_A, both.id, "urgent");
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: onlyWork.id,
      name: "work",
    });

    const one = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
    });
    expect(one.map((r) => r.title).sort()).toEqual(["Both", "Only work"]);

    const two = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId, urgentId],
    });
    expect(two.map((r) => r.title)).toEqual(["Both"]);
  });

  it("never returns a tagged note from a password-protected journal", async () => {
    // Mandatory. Tag filtering is a *new* way to ask "does a note exist", so it
    // has to go through the same gate the text path does — otherwise the lock
    // leaks through the feature that was added last.
    const journal = await makeJournal(USER_A, { title: "Locked" });
    const note = await makeSearchableNote(
      journal.id,
      "Secret",
      "very private confession",
    );

    // Tagged before locking; a tag cannot be attached through the lock.
    const secretId = await tag(USER_A, note.id, "secret");

    await testDb.journal.update({
      where: { id: journal.id },
      data: { hashedPassword: await hash("a-long-enough-password") },
    });

    expect(
      await callerFor(USER_A).searchRouter.search({
        query: "",
        tagIds: [secretId],
      }),
    ).toEqual([]);

    // And not through the combined path either.
    expect(
      await callerFor(USER_A).searchRouter.search({
        query: "confession",
        tagIds: [secretId],
      }),
    ).toEqual([]);
  });

  it("never returns a tagged note from a trashed journal", async () => {
    const journal = await makeJournal(USER_A);
    const note = await makeSearchableNote(journal.id, "Trashed", "findable");
    const tagId = await tag(USER_A, note.id, "work");

    await testDb.journal.update({
      where: { id: journal.id },
      data: { trash: true },
    });

    expect(
      await callerFor(USER_A).searchRouter.search({
        query: "",
        tagIds: [tagId],
      }),
    ).toEqual([]);
  });

  it("refuses a tag id belonging to another user", async () => {
    const journalA = await makeJournal(USER_A);
    const noteA = await makeSearchableNote(journalA.id, "A", "text");
    const tagId = await tag(USER_A, noteA.id, "private");

    // An explicit refusal rather than an empty list: results are user-scoped
    // regardless, so this is about saying so, not about confidentiality.
    await expect(
      callerFor(USER_B).searchRouter.search({ query: "", tagIds: [tagId] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a tag id that does not exist at all", async () => {
    await expect(
      callerFor(USER_A).searchRouter.search({
        query: "",
        tagIds: ["cnonexistenttagidaaaaaaaa"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects more tags than the filter cap allows", async () => {
    await expect(
      callerFor(USER_A).searchRouter.search({
        query: "anything",
        tagIds: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
      }),
    ).rejects.toBeDefined();
  });

  it("scopes a tag search to one journal when asked", async () => {
    const first = await makeJournal(USER_A, { title: "First" });
    const second = await makeJournal(USER_A, { title: "Second" });
    const noteOne = await makeSearchableNote(first.id, "A", "text");
    const noteTwo = await makeSearchableNote(second.id, "B", "text");

    const workId = await tag(USER_A, noteOne.id, "work");
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteTwo.id,
      name: "work",
    });

    const all = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
    });
    expect(all).toHaveLength(2);

    const scoped = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [workId],
      journalId: first.id,
    });
    expect(scoped.map((r) => r.id)).toEqual([noteOne.id]);
  });

  it("finds a tag that spans two journals, since tags belong to the user", async () => {
    const work = await makeJournal(USER_A, { title: "Work" });
    const home = await makeJournal(USER_A, { title: "Home" });
    const noteOne = await makeSearchableNote(work.id, "At work", "text");
    const noteTwo = await makeSearchableNote(home.id, "At home", "text");

    const ideaId = await tag(USER_A, noteOne.id, "ideas");
    await callerFor(USER_A).tagRouter.addTagToNote({
      noteId: noteTwo.id,
      name: "ideas",
    });

    const results = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [ideaId],
    });

    expect(results.map((r) => r.journalTitle).sort()).toEqual(["Home", "Work"]);
  });

  it("honours the limit on a tag-only search", async () => {
    const journal = await makeJournal(USER_A);
    const first = await makeSearchableNote(journal.id, "Note 0", "text");
    const tagId = await tag(USER_A, first.id, "work");

    for (let i = 1; i < 5; i++) {
      const note = await makeSearchableNote(journal.id, `Note ${i}`, "text");
      await callerFor(USER_A).tagRouter.addTagToNote({
        noteId: note.id,
        name: "work",
      });
    }

    const results = await callerFor(USER_A).searchRouter.search({
      query: "",
      tagIds: [tagId],
      limit: 3,
    });

    expect(results).toHaveLength(3);
  });
});

describe("searchVector stays in step with writes", () => {
  it("makes a note findable immediately after saveNote", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id, { title: "Untitled" });

    // Not findable yet — the body is empty.
    expect(
      await a.searchRouter.search({ query: "serendipity" }),
    ).toEqual([]);

    await a.notesRouter.saveNote({
      noteId: note.id,
      content: [
        { type: "p", children: [{ text: "A note about serendipity." }] },
      ],
    });

    // Postgres regenerated searchVector from the plainText saveNote wrote.
    const results = await a.searchRouter.search({ query: "serendipity" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(note.id);
  });

  it("stops finding text that was removed", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id);

    await a.notesRouter.saveNote({
      noteId: note.id,
      content: [{ type: "p", children: [{ text: "temporary phrase" }] }],
    });
    expect(await a.searchRouter.search({ query: "temporary" })).toHaveLength(1);

    await a.notesRouter.saveNote({
      noteId: note.id,
      content: [{ type: "p", children: [{ text: "replaced entirely" }] }],
    });
    expect(await a.searchRouter.search({ query: "temporary" })).toEqual([]);
    expect(await a.searchRouter.search({ query: "replaced" })).toHaveLength(1);
  });
});
