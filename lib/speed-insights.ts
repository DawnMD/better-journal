type SpeedInsightsEvent = {
  type: "vital";
  url: string;
  route?: string;
};

const SHARE_ROUTE = "/share/[token]";

/**
 * Speed Insights `beforeSend`: keeps share tokens out of reported vitals.
 *
 * The Next adapter already groups events by route pattern, but each event's
 * `url` still carries the real path, and on a shared note that path *is* the
 * share link. Rewriting it to the pattern means a vital can never hand out
 * read access to a note. The path is matched as well as the route, because the
 * route can be missing before the adapter has resolved the page's params.
 */
export function scrubSpeedInsightsEvent(
  event: SpeedInsightsEvent,
): SpeedInsightsEvent {
  const url = new URL(event.url);
  const isShare =
    event.route === SHARE_ROUTE || url.pathname.startsWith("/share/");

  if (!isShare) return event;

  return { ...event, url: `${url.origin}${SHARE_ROUTE}`, route: SHARE_ROUTE };
}
