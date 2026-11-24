"use client";

import { scrubSpeedInsightsEvent } from "@/lib/speed-insights";
import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";

/**
 * Real-user TTFB / LCP / INP per route, reported to Vercel Speed Insights.
 *
 * A client component only so the `beforeSend` scrubber, a function, can be
 * handed to the package; the root layout is a server component and cannot pass
 * one across the boundary.
 */
export function SpeedInsights() {
  return <VercelSpeedInsights beforeSend={scrubSpeedInsightsEvent} />;
}
