"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { env } from "@/env";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, startOfWeek, subDays } from "date-fns";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * AI insights for one journal.
 *
 * Rendered only when NEXT_PUBLIC_AI_INSIGHTS_ENABLED is "true" — but that is a
 * convenience, not a control. Every procedure behind this panel refuses
 * server-side when the feature is off, so a user who flips the flag in devtools
 * gets NOT_IMPLEMENTED rather than access.
 */
export const AiInsightsPanel = ({ journalId }: { journalId: string }) => {
  const timeZone = clientTimeZone();

  // Hidden entirely rather than shown-disabled: a control that can never work in
  // this deployment is worse than no control.
  if (env.NEXT_PUBLIC_AI_INSIGHTS_ENABLED !== "true") return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WeeklySummary journalId={journalId} timeZone={timeZone} />
      <AskJournal journalId={journalId} />
    </div>
  );
};

function WeeklySummary({
  journalId,
  timeZone,
}: {
  journalId: string;
  timeZone: string;
}) {
  const weekOf = format(startOfWeek(new Date()), "yyyy-MM-dd");

  const { data: quota } = useQuery(orpc.aiRouter.getQuota.queryOptions());

  const {
    mutate: summarise,
    data: summary,
    isPending,
  } = useMutation(
    orpc.aiRouter.weeklySummary.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" />
          This week
        </CardTitle>
        <CardDescription>
          Themes and tone across the week&apos;s entries.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => summarise({ journalId, weekOf, timeZone })}
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {summary ? "Regenerate" : "Summarise"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!summary && !isPending && (
          <p className="text-muted-foreground">
            Nothing generated yet.
            {quota && ` ${quota.limit - quota.used} of ${quota.limit} requests left today.`}
          </p>
        )}

        {summary && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {summary.themes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {theme}
                </span>
              ))}
            </div>
            <p>
              <span className="font-medium">Tone. </span>
              <span className="text-muted-foreground">{summary.tone}</span>
            </p>
            <p className="text-muted-foreground">{summary.reflection}</p>
            <p className="text-xs text-muted-foreground">
              From {summary.entryCount}{" "}
              {summary.entryCount === 1 ? "entry" : "entries"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Streaming chat over a bounded date range.
 *
 * Reads the response body incrementally rather than awaiting the whole thing:
 * the endpoint streams tokens, and buffering them here would throw away the only
 * reason it streams.
 */
function AskJournal({ journalId }: { journalId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnswer("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          journalId,
          question: trimmed,
          // A bounded range by default. Unbounded would grow the prompt — and
          // the bill — without limit.
          from: format(subDays(new Date(), 90), "yyyy-MM-dd"),
          to: format(new Date(), "yyyy-MM-dd"),
        }),
      });

      if (!response.ok || !response.body) {
        const { error } = await response
          .json()
          .catch(() => ({ error: "Something went wrong." }));
        toast.error(error);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      // An abort is the user starting a new question, not a failure.
      if ((error as Error).name !== "AbortError") {
        toast.error("Failed to reach the server.");
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" />
          Ask your journal
        </CardTitle>
        <CardDescription>
          Answered from your last 90 days of entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask();
          }}
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What have I been worrying about?"
            maxLength={2000}
          />
          <Button type="submit" disabled={!question.trim() || isStreaming}>
            {isStreaming ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              "Ask"
            )}
          </Button>
        </form>

        {answer && (
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {answer}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground align-text-bottom" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
