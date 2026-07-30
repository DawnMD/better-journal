import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callerFor,
  makeJournal,
  makeNote,
  testDb,
  USER_A,
  USER_B,
} from "../helpers/db";
import { consumeAiQuota, DAILY_AI_LIMIT } from "@/server/lib/ai-rate-limit";

/**
 * The env gate.
 *
 * The claim being tested is the one the whole feature rests on: with no
 * ANTHROPIC_API_KEY and the flag off, the app still works and every AI procedure
 * refuses — server-side, not by hiding a button. The test suite runs in exactly
 * that configuration (no key in CI), so these assertions describe the default
 * deployment rather than a special case.
 */

describe("AI procedures are gated server-side", () => {
  it("refuses with NOT_IMPLEMENTED when the feature is off", async () => {
    // The suite runs with AI_INSIGHTS_ENABLED unset, so this is the real
    // default-deployment path, not a mock.
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);

    await expect(
      a.aiRouter.weeklySummary({
        journalId: journal.id,
        weekOf: "2026-07-27",
      }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  it("refuses analyzeNote too", async () => {
    const a = callerFor(USER_A);
    const journal = await makeJournal(USER_A);
    const note = await makeNote(journal.id, { plainText: "some writing" });

    await expect(
      a.aiRouter.analyzeNote({ noteId: note.id }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  it("rejects anonymous callers before checking the flag", async () => {
    // Order matters: an unauthenticated caller should learn they are
    // unauthenticated, not that the feature happens to be disabled.
    await expect(
      callerFor(null).aiRouter.weeklySummary({
        journalId: "whatever",
        weekOf: "2026-07-27",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("gates before doing any ownership work, so it cannot leak existence", async () => {
    // Asking about someone else's journal with the feature off must not reveal
    // whether that journal exists.
    const journalA = await makeJournal(USER_A);

    await expect(
      callerFor(USER_B).aiRouter.weeklySummary({
        journalId: journalA.id,
        weekOf: "2026-07-27",
      }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  it("leaves non-AI procedures completely unaffected", async () => {
    // The whole point of the gate: the app runs normally without a key.
    const a = callerFor(USER_A);
    const journalId = await a.journalRouter.createJournal({ title: "Works" });
    const note = await a.notesRouter.createNote({ journalId });

    expect(note.journalId).toBe(journalId);
    await expect(
      a.notesRouter.getNoteById({ noteId: note.id }),
    ).resolves.toMatchObject({ id: note.id });
  });

  it("still serves the quota reader, which is not gated", async () => {
    // getQuota drives UI state and must work regardless, so the panel can say
    // "unavailable" rather than erroring.
    await expect(callerFor(USER_A).aiRouter.getQuota()).resolves.toMatchObject({
      used: 0,
      limit: DAILY_AI_LIMIT,
    });
  });
});

describe("AI rate limiting", () => {
  beforeEach(async () => {
    await testDb.aiUsage.deleteMany({});
  });

  afterEach(async () => {
    await testDb.aiUsage.deleteMany({});
  });

  it("counts consumption per user", async () => {
    await consumeAiQuota(testDb, USER_A);
    await consumeAiQuota(testDb, USER_A);

    const quota = await callerFor(USER_A).aiRouter.getQuota();
    expect(quota.used).toBe(2);
  });

  it("keeps users' counters separate", async () => {
    await consumeAiQuota(testDb, USER_A);
    await consumeAiQuota(testDb, USER_A);
    await consumeAiQuota(testDb, USER_B);

    expect((await callerFor(USER_A).aiRouter.getQuota()).used).toBe(2);
    expect((await callerFor(USER_B).aiRouter.getQuota()).used).toBe(1);
  });

  it("throws once the limit is exceeded", async () => {
    for (let i = 0; i < 3; i++) {
      await consumeAiQuota(testDb, USER_A, 3);
    }

    await expect(consumeAiQuota(testDb, USER_A, 3)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("does not double-count under concurrency", async () => {
    // The upsert is the mechanism: ([userId, day]) is unique, so Postgres
    // serialises concurrent increments rather than letting two requests read
    // the same count and both write count+1.
    await Promise.all(
      Array.from({ length: 20 }, () => consumeAiQuota(testDb, USER_A, 100)),
    );

    const quota = await callerFor(USER_A).aiRouter.getQuota();
    expect(quota.used).toBe(20);
  });
});
