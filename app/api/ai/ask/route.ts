import { env } from "@/env";
import { toPlainText } from "@/lib/plate";
import { prisma } from "@/lib/prisma";
import { consumeAiQuota } from "@/server/lib/ai-rate-limit";
import { AI_BETAS, AI_FALLBACKS, AI_MODEL, anthropic } from "@/server/lib/anthropic";
import { verifyUnlockToken } from "@/server/lib/unlock";
import { unlockCookieName } from "@/server/lib/unlock";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import z from "zod";

/**
 * Ask-your-journal, streamed.
 *
 * A plain route handler rather than an oRPC `eventIterator`: this is a one-way
 * token stream with no request/response typing to gain, and a `ReadableStream`
 * over `fetch` is both simpler and easier for the client to consume than routing
 * SSE through the RPC handler.
 *
 * Everything the RPC layer would have given us for free is therefore done by
 * hand here — auth, ownership, the lock check, the quota — and none of it is
 * optional.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  journalId: z.string(),
  question: z.string().trim().min(1).max(2000),
  /** Bounded range. Unbounded would grow the prompt without limit. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // The same gate as aiProcedure. This route does not go through oRPC, so the
  // check is repeated rather than inherited — a feature flag that only guards
  // one of two entry points is not a feature flag.
  if (env.AI_INSIGHTS_ENABLED !== "true" || !env.ANTHROPIC_API_KEY) {
    return jsonError("AI insights are not enabled on this deployment.", 501);
  }

  const { userId } = await auth();
  if (!userId) return jsonError("Unauthorized", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request body", 400);

  const { journalId, question, from, to } = parsed.data;

  const journal = await prisma.journal.findFirst({
    where: { id: journalId, userId, trash: false },
    select: { id: true, title: true, hashedPassword: true },
  });

  // NOT_FOUND rather than FORBIDDEN for someone else's journal, matching the
  // rest of the API — ids stay non-enumerable.
  if (!journal) return jsonError("Not found", 404);

  if (journal.hashedPassword) {
    const store = await cookies();
    const token = store.get(unlockCookieName(journalId))?.value;

    // A locked journal's contents must not reach a prompt either.
    if (!verifyUnlockToken(token, journalId, userId)) {
      return jsonError("This journal is locked.", 403);
    }
  }

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const entries = await prisma.note.findMany({
    where: { journalId, createdAt: { gte: start, lt: end } },
    select: { title: true, createdAt: true, plainText: true, content: true },
    orderBy: { createdAt: "asc" },
    // A hard ceiling on how much writing one question can pull in. Opus 5 has a
    // 1M-token window, so this is about predictable cost, not capacity.
    take: 500,
  });

  if (entries.length === 0) {
    return jsonError("No entries in that range.", 404);
  }

  try {
    await consumeAiQuota(prisma, userId);
  } catch {
    return jsonError("Daily AI limit reached.", 429);
  }

  const entriesBlock = entries
    .map((entry) => {
      const text = entry.plainText?.trim() || toPlainText(entry.content);
      return `--- ${entry.createdAt.toISOString().slice(0, 10)} · ${entry.title ?? "Untitled"} ---\n${text || "(empty)"}`;
    })
    .join("\n\n");

  const stream = anthropic().beta.messages.stream({
    model: AI_MODEL,
    // Large, so a long answer is never truncated mid-thought. Streaming is what
    // makes this safe — a non-streaming request this size risks an HTTP timeout.
    max_tokens: 64000,
    betas: AI_BETAS,
    fallbacks: AI_FALLBACKS,
    system: [
      {
        type: "text",
        text: `You are answering questions about someone's private journal.

Answer only from the entries provided. If the entries do not contain the answer,
say so plainly rather than guessing or generalising. Quote sparingly and only
what is actually written. Write to the person in second person. Do not diagnose,
moralise, or give advice that was not asked for.`,
      },
      {
        // The entries are part of the *stable* prefix for a given range, so the
        // cache breakpoint goes here — after them, before the question. Putting
        // the breakpoint before the entries would cache almost nothing; putting
        // the question inside the prefix would invalidate it on every ask.
        type: "text",
        text: `Journal: ${journal.title}\nEntries ${from} to ${to}:\n\n${entriesBlock}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: question }],
  });

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();

        // A refusal arrives as a successful response with stop_reason
        // "refusal" and no content — not an exception. Without this the client
        // would see an empty 200 and no explanation.
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode(
              "\n\n_The model declined to answer this question about these entries._",
            ),
          );
        }

        // Cache effectiveness is only observable here. Zero across repeated
        // asks over the same range means something in the prefix is varying.
        console.log(
          `[ai/ask] cache_read=${final.usage.cache_read_input_tokens ?? 0} ` +
            `cache_write=${final.usage.cache_creation_input_tokens ?? 0} ` +
            `in=${final.usage.input_tokens} out=${final.usage.output_tokens}`,
        );

        controller.close();
      } catch (error) {
        console.error("[ai/ask] stream failed", error);
        controller.enqueue(
          encoder.encode("\n\n_Something went wrong generating this answer._"),
        );
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Without this, a proxy that buffers the response defeats streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
