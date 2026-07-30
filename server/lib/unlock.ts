import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Journal unlock tokens.
 *
 * A client-side `unlocked` boolean would be theatre: the RPC endpoints are
 * directly callable, so anyone could skip the dialog entirely. The unlock has to
 * be something the *server* can verify on every subsequent request, which means
 * a token.
 *
 * Shape: `journalId.userId.expiresAt.signature`, HMAC-SHA256 over the first three
 * fields.
 *
 *  - Scoped to a journal AND a user, so a token minted for one journal cannot
 *    open another, and a leaked token is useless in someone else's session.
 *  - Carries its own expiry, checked on verify, so a stale cookie cannot be
 *    replayed indefinitely.
 *  - Stateless: no server-side session table to grow or clean up. The tradeoff is
 *    that it cannot be revoked before expiry, which is why the window is short.
 *
 * Deliberately *not* a JWT. This needs one algorithm and four fields; a JWT
 * library would add a dependency, an `alg` header worth attacking, and no benefit.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SEPARATOR = ".";

export const UNLOCK_COOKIE_PREFIX = "journal_unlock_";

/** The cookie name for a journal. One cookie per journal, so unlocks are independent. */
export function unlockCookieName(journalId: string) {
  return `${UNLOCK_COOKIE_PREFIX}${journalId}`;
}

/**
 * The signing key.
 *
 * Falls back to a random per-process key when UNLOCK_TOKEN_SECRET is unset, which
 * is intentional: it keeps `next build` and the test suite working with no
 * configuration, and the failure mode is merely that unlocks do not survive a
 * restart (or work across instances). It is never a silent *security* downgrade —
 * an unsigned or predictable key would be.
 */
let ephemeralSecret: Buffer | undefined;

function signingKey(): Buffer {
  const configured = process.env.UNLOCK_TOKEN_SECRET;

  if (configured) return Buffer.from(configured, "utf8");

  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32);

    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[unlock] UNLOCK_TOKEN_SECRET is not set. Unlock tokens are signed with " +
          "a per-process key, so they will not survive a restart and will not " +
          "validate across instances. Set it in production.",
      );
    }
  }

  return ephemeralSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Mints a token for `journalId`, valid for 30 minutes. */
export function issueUnlockToken(journalId: string, userId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = [journalId, userId, expiresAt].join(SEPARATOR);

  return `${payload}${SEPARATOR}${sign(payload)}`;
}

/**
 * True if `token` is a live, correctly-signed unlock for this journal and user.
 *
 * Order matters: the signature is checked before the expiry is trusted, because
 * the expiry is part of the signed payload — reading it from an unverified token
 * would let a caller pick their own.
 */
export function verifyUnlockToken(
  token: string | undefined | null,
  journalId: string,
  userId: string,
): boolean {
  if (!token) return false;

  const parts = token.split(SEPARATOR);
  if (parts.length !== 4) return false;

  const [tokenJournalId, tokenUserId, expiresAtRaw, signature] = parts;

  const payload = [tokenJournalId, tokenUserId, expiresAtRaw].join(SEPARATOR);

  if (!constantTimeEqual(signature, sign(payload))) return false;

  // Only now that the payload is authenticated are its fields trustworthy.
  if (tokenJournalId !== journalId) return false;
  if (tokenUserId !== userId) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return false;

  return Date.now() < expiresAt;
}

/** Compares without leaking length or content through timing. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  // timingSafeEqual throws on a length mismatch, so that is checked first —
  // the length of an HMAC digest is not a secret.
  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

export const UNLOCK_TTL_SECONDS = TOKEN_TTL_MS / 1000;
