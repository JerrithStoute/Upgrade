/**
 * Vendor paperwork: the papers a builder wants from a sub or vendor (W-9, Insurance, their own kinds like a
 * Contractor agreement), which ones each vendor needs, and where each stands today.
 *
 *  - The builder decides what each vendor needs. A new vendor starts with the "usual" kinds; a one-time sub
 *    can have them all unticked — then nothing about him is ever flagged.
 *  - Insurance is one line per coverage (General liability, Workers' comp… — each builder's own list), each
 *    with its carrier, policy # and expiry typed in; one certificate file can be on several. A kind that
 *    expires is good while it has a current paper on file; expired ones stay on the line, greyed, once a
 *    renewal is there.
 *  - Nothing here stops work: it's shown as a warning where you hand out work, and on the dashboard.
 *
 * Pure (no database) — paperwork-server.ts loads and saves.
 */

export const SOON_DAYS = 30;
const DAY = 86_400_000;

export type PaperType = { id: string; name: string; kind: string | null; expires: boolean; usual: boolean; sortOrder: number };
export type PaperDoc = {
  id: string;
  typeId: string;
  expiresAt: Date | null;
  carrier?: string | null;
  number?: string | null;
  confirmed: boolean;
  fileName: string | null;
  storagePath: string | null;
  createdAt: Date;
};
/** What a vendor needs: kind id → the day it was first needed ("YYYY-MM-DD"). */
export type Needs = Record<string, string>;

export type LineStatus = "ok" | "soon" | "missing" | "expired" | "noDate" | "notNeeded";
export type PaperLine = {
  type: PaperType;
  needed: boolean;
  status: LineStatus;
  /** The first current paper to run out (an expiring kind). */
  expiresAt: Date | null;
  /** Since when it's been a problem (missing: since it was needed; expired: its expiry), for "12 days". */
  since: Date | null;
  docs: (PaperDoc & { expired: boolean })[];
  /** Uploaded by the vendor, not looked at yet. */
  toConfirm: number;
};

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * A vendor's saved needs. Never set up (null): the usual kinds, needed since the vendor was added — so a vendor
 * added anywhere (a bid, a PO, the Item List) starts with the usual set without each place having to.
 */
export function readNeeds(text: string | null | undefined, types: PaperType[], addedAt: Date): Needs {
  if (text == null) return Object.fromEntries(types.filter((t) => t.usual).map((t) => [t.id, ymd(addedAt)]));
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const known = new Set(types.map((t) => t.id));
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([id, v]) => known.has(id) && typeof v === "string" && fromYmd(v)) as [string, string][]);
  } catch {
    return {};
  }
}

/** The needs after ticking `ids`: ones already needed keep their date, new ones are needed from today. */
export function setNeeds(had: Needs, ids: string[], today: Date): Needs {
  return Object.fromEntries([...new Set(ids)].map((id) => [id, had[id] ?? ymd(today)]));
}

/** Where each kind stands for one vendor today (in the kinds' order). */
export function paperLines(types: PaperType[], needs: Needs, docs: PaperDoc[], today = new Date()): PaperLine[] {
  const day = dayOf(today);
  const soon = new Date(day.getTime() + SOON_DAYS * DAY);
  return [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((type) => {
      const mine = docs
        .filter((d) => d.typeId === type.id)
        .map((d) => ({ ...d, expired: type.expires && !!d.expiresAt && d.expiresAt < day }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const confirmed = mine.filter((d) => d.confirmed);
      const needed = type.id in needs;
      const neededSince = needed ? fromYmd(needs[type.id]) : null;
      const toConfirm = mine.length - confirmed.length;
      let status: LineStatus;
      let expiresAt: Date | null = null;
      let since: Date | null = null;
      if (!type.expires) {
        status = confirmed.length ? "ok" : "missing";
        if (status === "missing") since = neededSince;
      } else {
        const current = confirmed.filter((d) => d.expiresAt && !d.expired);
        const dated = confirmed.filter((d) => d.expiresAt);
        if (current.length) {
          expiresAt = new Date(Math.min(...current.map((d) => d.expiresAt!.getTime())));
          status = expiresAt <= soon ? "soon" : "ok";
        } else if (dated.length) {
          // All run out: expired since the last one did.
          expiresAt = new Date(Math.max(...dated.map((d) => d.expiresAt!.getTime())));
          status = "expired";
          since = expiresAt;
        } else if (confirmed.length) {
          status = "noDate";
          since = confirmed[confirmed.length - 1].createdAt;
        } else {
          status = "missing";
          since = neededSince;
        }
      }
      if (!needed && status !== "ok" && status !== "soon") status = "notNeeded";
      return { type, needed, status, expiresAt, since, docs: mine, toConfirm };
    });
}

/** The lines that need doing something about (needed, and not good). */
export const problems = (lines: PaperLine[]) => lines.filter((l) => l.needed && l.status !== "ok");

/** Whole days from `since` to today (0 = today). */
export const daysOpen = (since: Date | null, today = new Date()) => (since ? Math.max(0, Math.round((dayOf(today).getTime() - dayOf(since).getTime()) / DAY)) : 0);

/** One problem in words: "W-9 missing", "Insurance expires Nov 18", "Insurance expired Oct 2", "Insurance: add its expiry date". */
export function problemText(l: PaperLine, fmt: (d: Date) => string) {
  switch (l.status) {
    case "missing":
      return `${l.type.name} missing`;
    case "expired":
      return `${l.type.name} expired ${fmt(l.expiresAt!)}`;
    case "soon":
      return `${l.type.name} expires ${fmt(l.expiresAt!)}`;
    case "noDate":
      return `${l.type.name}: add its expiry date`;
    default:
      return "";
  }
}

/** A vendor's problems in one line ("W-9 missing · Insurance expires Nov 18"); "" when all's well. */
export const paperworkWarning = (lines: PaperLine[], fmt: (d: Date) => string) =>
  problems(lines)
    .map((l) => problemText(l, fmt))
    .join(" · ");

/**
 * Who something goes to — for who handles subs' paperwork (Company.paperworkOwner) and who gets an email
 * (notify-rules.ts): "pos:<position id>", "user:<user id>", or "role:<key>" for one worked out each time
 * (the job's manager…).
 */
export function readWho(text: string | null | undefined): string[] {
  try {
    const raw = JSON.parse(text ?? "") as unknown;
    return Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && /^(pos|user|role):[\w-]+$/.test(x)))] : [];
  } catch {
    return [];
  }
}

/** A line as the vendor page shows it (dates as text, days counted) — the shape PaperworkList takes. */
export function lineView(l: PaperLine, today = new Date()) {
  return {
    typeId: l.type.id,
    name: l.type.name,
    expires: l.type.expires,
    needed: l.needed,
    status: l.status,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    daysOpen: daysOpen(l.since, today),
    daysLeft: l.expiresAt && l.status === "soon" ? Math.max(0, Math.round((dayOf(l.expiresAt).getTime() - dayOf(today).getTime()) / DAY)) : null,
    kind: l.type.kind,
    docs: l.docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      hasFile: !!d.storagePath,
      expiresAt: d.expiresAt?.toISOString() ?? null,
      carrier: d.carrier ?? null,
      number: d.number ?? null,
      expired: d.expired,
      confirmed: d.confirmed,
    })),
  };
}

/** Insurance coverages start as these for a new builder (each builder renames, adds or removes its own). */
export const STARTER_COVERAGES = [
  { name: "General liability", usual: true, code: "GL" },
  { name: "Workers' comp", usual: true, code: "WC" },
  { name: "Auto", usual: false, code: "AUTO" },
  { name: "Umbrella", usual: false, code: "UMBRELLA" },
] as const;

/** "••-•••4471": a tax ID with all but its last 4 hidden. */
export const maskTaxId = (id: string | null | undefined) => (id ? id.replace(/\d(?=(?:\D*\d){4})/g, "•") : "");
