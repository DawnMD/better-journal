"use client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getQueryClient } from "@/lib/query/get-query-client";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryClientProvider } from "@tanstack/react-query";

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // `prefetchUI` fetches Clerk's own component bundle. Nothing renders one any
  // more — the auth screens are ours and the rest of the app only uses hooks —
  // so it was a script downloaded on every first paint and never run. The
  // browser console said as much.
  return (
    <ClerkProvider prefetchUI={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
