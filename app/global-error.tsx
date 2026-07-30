"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary, for failures in the root layout itself.
 *
 * It has to render its own <html>/<body>: at this level the root layout is the
 * thing that failed, so nothing above is available. Deliberately dependency-free
 * — no fonts, no providers, no UI kit — because any of those could be the cause.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Better Journal is temporarily unavailable
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            Something failed while starting the app.
          </p>
          {error.digest && (
            <p
              style={{
                color: "#888",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
