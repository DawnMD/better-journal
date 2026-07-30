/**
 * Search highlight delimiters, shared by the server query and the client renderer.
 *
 * Lives in `lib/` rather than beside the router so the client can import it without
 * pulling the server router — and with it Prisma and argon2 — into the browser
 * bundle.
 *
 * They are ASCII STX/ETX rather than `<mark>` because `ts_headline` does **not**
 * escape the text it is given: it only splices StartSel/StopSel around matches.
 * Asking Postgres for HTML and rendering the result with `dangerouslySetInnerHTML`
 * would execute whatever markup a note body happened to contain. Control
 * characters cannot appear in a Plate text leaf, so a note cannot spoof them.
 */

export const HL_START = "";
export const HL_END = "";

/** Splits a snippet into alternating plain/highlighted runs. */
export const HL_SPLIT = new RegExp(`[${HL_START}${HL_END}]`);
