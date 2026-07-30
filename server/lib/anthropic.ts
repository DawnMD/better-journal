import { env } from "@/env";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client and shared request parameters.
 *
 * Constructed lazily and cached, for the same reason the Prisma client is: a
 * module-level client would be built at import time even in deployments with the
 * feature switched off.
 */

/** Opus 5. Exported so tests and prompts reference one constant. */
export const AI_MODEL = "claude-opus-5";

/**
 * Server-side fallback beta.
 *
 * Opus 5's safety classifiers can decline a request outright — a normal HTTP 200
 * with `stop_reason: "refusal"`. `fallbacks: "default"` re-runs a declined
 * request on Anthropic's recommended substitute inside the same call, routed by
 * refusal category. Preferred over naming a model ourselves: the right
 * substitute depends on *why* the request was declined, and a pinned model is a
 * migration we would owe later.
 *
 * The `"default"` scalar form requires this specific beta date; the older
 * array form uses `-2026-06-01`, and pairing either header with the other form
 * is a 400.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let cached: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    // aiProcedure should have rejected the request long before this. If it
    // didn't, fail loudly rather than letting the SDK throw something vaguer.
    throw new Error(
      "ANTHROPIC_API_KEY is not set. AI procedures must go through aiProcedure.",
    );
  }

  cached ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cached;
}

/**
 * Parameters every AI call shares.
 *
 * Deliberately does NOT set `temperature`, `top_p`, `top_k`, or
 * `thinking.budget_tokens` — all four are removed on Opus 5 and return a 400.
 * Behaviour is steered through the prompt and `effort` instead.
 *
 * `thinking` is also left unset: on Opus 5, omitting it runs adaptive thinking,
 * which is what we want. (This is a change from Opus 4.8, where omitting it
 * meant no thinking at all.)
 */
export const AI_BETAS = [FALLBACK_BETA];
export const AI_FALLBACKS = "default" as const;

/** True when the model declined the request rather than answering it. */
export function isRefusal(response: { stop_reason?: string | null }): boolean {
  return response.stop_reason === "refusal";
}

/**
 * Pulls the concatenated text out of a response.
 *
 * `content` is a discriminated union, so every block is narrowed by `type`
 * rather than indexed — `content[0].text` throws on a refusal (empty array) and
 * on any response that leads with a thinking block.
 */
export function textOf(response: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}
