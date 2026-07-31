import { ORPCError as ClientORPCError } from "@orpc/client";
import { ORPCError as ServerORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import {
  isConflictError,
  isNotFoundError,
  isRequestError,
} from "@/lib/orpc.errors";

/**
 * These two predicates decide whether a bad URL becomes a 404 or a generic
 * error boundary, and whether React Query re-asks a question that already has a
 * settled answer. Both hinge on recognising an ORPCError that was thrown in a
 * different module graph than the one doing the checking, which is exactly the
 * case Next.js creates between server and client bundles.
 */
describe("isNotFoundError", () => {
  it("matches the NOT_FOUND the routers throw", () => {
    expect(isNotFoundError(new ServerORPCError("NOT_FOUND"))).toBe(true);
  });

  it("matches across the client/server package boundary", () => {
    // server/lib/authorize.ts throws the @orpc/server export; the pages check
    // with the @orpc/client one. If these ever stopped being the same class,
    // every 404 would silently degrade into an error page.
    expect(isNotFoundError(new ClientORPCError("NOT_FOUND"))).toBe(true);
  });

  it("does not match other codes, or plain errors", () => {
    expect(isNotFoundError(new ServerORPCError("FORBIDDEN"))).toBe(false);
    expect(isNotFoundError(new ServerORPCError("INTERNAL_SERVER_ERROR"))).toBe(
      false,
    );
    expect(isNotFoundError(new Error("NOT_FOUND"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError({ code: "NOT_FOUND" })).toBe(false);
  });
});

describe("isConflictError", () => {
  it("matches the CONFLICT renameTag throws, on both sides of the boundary", () => {
    expect(isConflictError(new ServerORPCError("CONFLICT"))).toBe(true);
    expect(isConflictError(new ClientORPCError("CONFLICT"))).toBe(true);
  });

  it("does not match the NOT_FOUND thrown for someone else's tag", () => {
    // The rename dialog offers a merge on CONFLICT. Confusing the two would
    // have it offer to merge into a tag the user cannot see.
    expect(isConflictError(new ServerORPCError("NOT_FOUND"))).toBe(false);
    expect(isConflictError(new Error("CONFLICT"))).toBe(false);
    expect(isConflictError(null)).toBe(false);
  });

  it("preserves the data the client needs to offer the merge", () => {
    const error = new ServerORPCError("CONFLICT", {
      data: { reason: "tag-exists", existingTagId: "abc", noteCount: 12 },
    });

    expect(isConflictError(error)).toBe(true);
    expect(error.data).toMatchObject({ existingTagId: "abc", noteCount: 12 });
  });
});

describe("isRequestError", () => {
  it("is true for the 4xx codes the app throws deliberately", () => {
    for (const code of [
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "UNPROCESSABLE_CONTENT",
      "TOO_MANY_REQUESTS",
    ] as const) {
      expect(isRequestError(new ServerORPCError(code))).toBe(true);
    }
  });

  it("is false for 5xx and for non-ORPC failures, which are worth retrying", () => {
    expect(isRequestError(new ServerORPCError("INTERNAL_SERVER_ERROR"))).toBe(
      false,
    );
    expect(isRequestError(new ServerORPCError("SERVICE_UNAVAILABLE"))).toBe(
      false,
    );
    // A dropped connection arrives as a plain Error, and should be retried.
    expect(isRequestError(new TypeError("fetch failed"))).toBe(false);
  });

  it("honours an explicit status over the code's default", () => {
    expect(
      isRequestError(new ServerORPCError("CONFLICT", { status: 409 })),
    ).toBe(true);
  });
});
