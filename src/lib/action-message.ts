/**
 * What to show when a server action called from the page fails. Online, the server keeps its error
 * messages to itself (React then says "Minified React error #441…" or "An error occurred in the Server
 * Components render…") — nobody should see that. Messages written for people come through as they are.
 */
export function actionMessage(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || /Minified React error|Server Components render|omitted in production|digest/i.test(m)) return `${fallback} — nothing was changed. Try again; if it keeps happening, let us know.`;
  return m;
}
