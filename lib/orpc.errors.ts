import { ORPCError } from "@orpc/client";

/**
 * True for the `NOT_FOUND` the routers throw for a resource that is missing —
 * or that is simply not the caller's. Those are the same code on purpose (see
 * server/lib/authorize.ts), and the pages turn both into the same 404.
 *
 * `instanceof` is safe across Next's server/client boundary: ORPCError defines
 * `Symbol.hasInstance` specifically because Next can end up with more than one
 * copy of the constructor.
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "NOT_FOUND";
}

/**
 * True for any ORPC error in the 4xx range — a settled answer about *this*
 * request (missing, locked, rate-limited, malformed), not a transient failure
 * that a second attempt could resolve.
 */
export function isRequestError(error: unknown): boolean {
  return error instanceof ORPCError && error.status >= 400 && error.status < 500;
}
