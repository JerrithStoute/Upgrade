/**
 * Phone notifications: the kinds there are, who gets which, and what's turned off — plain rules,
 * no sending (that's push.ts). Tested in push-kinds.test.ts.
 */

/** What someone can get, by who they are. Each can be turned off (User.pushOff). */
export const PUSH_KINDS = {
  // The client's.
  SELECTIONS: { label: "Selections waiting on you or due", who: "CLIENT" },
  APPROVALS: { label: "Proposals and change orders to approve", who: "CLIENT" },
  INVOICES: { label: "New invoices", who: "CLIENT" },
  // A sub's or vendor's.
  POS: { label: "New purchase orders", who: "VENDOR" },
  // The team's.
  CLIENT_ANSWERS: { label: "Client picked a selection or answered a proposal or change order", who: "TEAM" },
  VENDOR_ANSWERS: { label: "Subs and vendors: POs answered, bills, bids and insurance sent in", who: "TEAM" },
  // Everyone's.
  MESSAGES: { label: "New messages", who: "ALL" },
  WARRANTY: { label: "Warranty requests and their updates", who: "ALL" },
} as const;
export type PushKind = keyof typeof PUSH_KINDS;

/** The kinds a person can get: clients, subs & vendors, or the team. */
export function kindsFor(role: string): PushKind[] {
  const who = role === "CLIENT" ? "CLIENT" : role === "VENDOR" ? "VENDOR" : "TEAM";
  return (Object.keys(PUSH_KINDS) as PushKind[]).filter((k) => PUSH_KINDS[k].who === who || PUSH_KINDS[k].who === "ALL");
}

/** The kinds someone turned off. */
export function pushOffList(pushOff: string | null | undefined): PushKind[] {
  try {
    const v = JSON.parse(pushOff ?? "[]");
    return Array.isArray(v) ? v.filter((k): k is PushKind => k in PUSH_KINDS) : [];
  } catch {
    return [];
  }
}

/** An address on this site, as a path (a notification opens it inside the installed app). */
export function sitePath(url: string) {
  try {
    const u = new URL(url, "http://x");
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}

