import { describe, expect, it } from "vitest";
import { scrubSpeedInsightsEvent } from "@/lib/speed-insights";

describe("scrubSpeedInsightsEvent", () => {
  it("replaces the share token in a shared-note URL with the route pattern", () => {
    const event = scrubSpeedInsightsEvent({
      type: "vital",
      url: "https://journal.example.com/share/abc123secret",
      route: "/share/[token]",
    });

    expect(event).toEqual({
      type: "vital",
      url: "https://journal.example.com/share/[token]",
      route: "/share/[token]",
    });
  });

  it("scrubs a shared-note URL even when the route is not known", () => {
    const event = scrubSpeedInsightsEvent({
      type: "vital",
      url: "https://journal.example.com/share/abc123secret",
    });

    expect(event).toEqual({
      type: "vital",
      url: "https://journal.example.com/share/[token]",
      route: "/share/[token]",
    });
  });

  it("sends only the route pattern for a shared note, dropping query and hash", () => {
    const event = scrubSpeedInsightsEvent({
      type: "vital",
      url: "https://journal.example.com/share/abc123secret/?from=abc123secret#top",
      route: "/share/[token]",
    });

    expect(event.url).toBe("https://journal.example.com/share/[token]");
  });

  it("leaves events from other routes untouched", () => {
    const event = {
      type: "vital" as const,
      url: "https://journal.example.com/journal/j_1/n_2",
      route: "/journal/[journalId]/[noteId]",
    };

    expect(scrubSpeedInsightsEvent(event)).toEqual(event);
  });
});
