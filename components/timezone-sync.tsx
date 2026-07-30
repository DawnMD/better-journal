"use client";

import { clientTimeZone, TZ_COOKIE } from "@/lib/timezone";
import { useEffect } from "react";

/**
 * Publishes the browser's IANA timezone to a cookie so server-side prefetches
 * can build the same query keys the client builds.
 *
 * Renders nothing. Writes only when the value actually changed, so it is a no-op
 * on every navigation after the first (and after a flight across timezones, it
 * corrects itself on the next mount).
 */
export function TimeZoneSync() {
  useEffect(() => {
    const zone = clientTimeZone();

    const current = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);

    if (current === zone) return;

    // Written raw, not percent-encoded. IANA zone names are made of
    // [A-Za-z0-9_+/-], all of which are legal cookie-octets, and encoding the
    // "/" in "Asia/Kolkata" would hand the server "Asia%2FKolkata" — which fails
    // Intl validation and silently falls back to UTC.
    if (!/^[A-Za-z0-9_+/-]+$/.test(zone)) return;

    // Not HttpOnly: it is written by the client, and it carries no secret.
    // Lax matches how it is read — same-site navigations only.
    document.cookie = `${TZ_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return null;
}
