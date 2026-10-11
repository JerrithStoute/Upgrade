/**
 * The Projects page's widgets — the three kinds of job and All projects — and how this browser
 * last left them: their order and which are tucked away (a cookie, so the page draws that way
 * straight off, with nothing jumping around).
 */

export const PROJECTS_COOKIE = "upgrade_projects";
export const WIDGET_KEYS = ["all", "spec", "custom", "remodel"] as const; // the default order: All projects on top
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export function projectsView(raw: string | undefined): { order: WidgetKey[]; collapsed: WidgetKey[] } {
  let v: { order?: unknown; collapsed?: unknown } = {};
  try {
    v = raw ? JSON.parse(decodeURIComponent(raw)) : {};
  } catch {
    v = {};
  }
  const known = (x: unknown): x is WidgetKey => typeof x === "string" && (WIDGET_KEYS as readonly string[]).includes(x);
  const saved = Array.isArray(v.order) ? [...new Set(v.order.filter(known))] : [];
  // Any widget not in the saved order (a new one) goes at the end.
  const order = [...saved, ...WIDGET_KEYS.filter((k) => !saved.includes(k))];
  const collapsed = Array.isArray(v.collapsed) ? v.collapsed.filter(known) : [];
  return { order, collapsed };
}
