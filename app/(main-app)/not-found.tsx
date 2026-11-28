import { JournalNotFound } from "@/components/journal-not-found";

/**
 * 404 inside the signed-in shell — in practice a journal id that no longer
 * resolves. The view is shared with the journal's error boundary, which shows
 * it when the miss is discovered by the client query instead of the server page.
 *
 * Nested under (main-app) so the top bar stays mounted: a dead
 * link should cost you the pane, not the app.
 */
export default function MainAppNotFound() {
  return <JournalNotFound />;
}
