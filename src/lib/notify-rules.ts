import { readWho } from "./paperwork";

/**
 * The emails the program sends by itself — not ones someone sends with a button (a PO, a bid, a proposal).
 * Each is the builder's choice (Settings → Email notifications): on or off, and for the team's, who gets it —
 * by position, by name, or someone worked out each time (the job's manager, whoever sent it…). Push
 * notifications follow the same choice.
 *
 * A company that has never saved a choice (notifyRules null — before this was a choice) keeps what it had;
 * a new company starts with every one off.
 */

export type Audience = "team" | "client" | "sub";
export type Role = { key: string; label: string };

export const ROLES = {
  everyone: { key: "everyone", label: "Everyone on the team" },
  sender: { key: "sender", label: "Whoever sent it" },
  manager: { key: "manager", label: "The job's manager" },
  assignee: { key: "assignee", label: "Whoever it's assigned to" },
  creator: { key: "creator", label: "Whoever added it" },
  inThread: { key: "inThread", label: "Team members in the conversation" },
  worker: { key: "worker", label: "The person on the clock" },
  timeFixers: { key: "timeFixers", label: "Whoever fixes people's time" },
  admins: { key: "admins", label: "Admins" },
  owner: { key: "owner", label: "Whoever handles paperwork" },
} satisfies Record<string, Role>;

export type NotifyDef = {
  key: string;
  label: string;
  about: string;
  audience: Audience;
  /** Who can be worked out for this one (team emails). */
  roles: Role[];
  /** What it did before it was a choice (notifyRules null). */
  legacy: { on: boolean; to: string[] };
};

const r = (...keys: (keyof typeof ROLES)[]) => keys.map((k) => ROLES[k]);
const to = (...keys: (keyof typeof ROLES)[]) => keys.map((k) => `role:${k}`);

export const NOTIFY_DEFS: NotifyDef[] = [
  // To your team
  { key: "morning", label: "Morning email", about: "Each person's to-dos, tasks starting and selections due, at 6 am. Anyone can still turn theirs off on their Account page.", audience: "team", roles: r("everyone"), legacy: { on: true, to: to("everyone") } },
  { key: "paperworkWeekly", label: "Paperwork reminder (weekly)", about: "Monday morning: subs missing paperwork, and insurance running out within 30 days.", audience: "team", roles: r("owner", "admins"), legacy: { on: false, to: to("owner") } },
  { key: "longShift", label: "Still on the clock", about: "Someone has been on the clock longer than your time clock settings allow.", audience: "team", roles: r("worker", "timeFixers"), legacy: { on: true, to: to("worker", "timeFixers") } },
  { key: "proposalAnswered", label: "Client answered a proposal", about: "Approved or declined in the portal.", audience: "team", roles: r("sender", "manager", "admins"), legacy: { on: true, to: to("sender", "manager") } },
  { key: "coAnswered", label: "Client answered a change order", about: "Approved or declined in the portal.", audience: "team", roles: r("sender", "manager", "admins"), legacy: { on: true, to: to("sender", "manager") } },
  { key: "selectionChosen", label: "Client made a selection", about: "Chose, changed or turned down a selection in the portal.", audience: "team", roles: r("manager", "admins"), legacy: { on: true, to: to("manager") } },
  { key: "clientMessage", label: "Message from a client", about: "A client wrote in a job's conversation.", audience: "team", roles: r("manager", "inThread", "admins"), legacy: { on: true, to: to("manager", "inThread") } },
  { key: "bidAnswered", label: "Vendor sent prices", about: "A vendor or sub answered a bid online.", audience: "team", roles: r("sender", "manager", "admins"), legacy: { on: true, to: to("sender", "manager") } },
  { key: "poAnswered", label: "Vendor answered a PO", about: "Accepted or declined in their portal.", audience: "team", roles: r("sender", "manager", "admins"), legacy: { on: true, to: to("sender") } },
  { key: "billUploaded", label: "Vendor sent a bill", about: "Uploaded in their portal, waiting for approval.", audience: "team", roles: r("sender", "manager", "admins"), legacy: { on: true, to: to("sender", "manager") } },
  { key: "paperworkUploaded", label: "Vendor sent paperwork", about: "A sub uploaded a W-9, insurance or other paper in their portal, to look over.", audience: "team", roles: r("owner", "admins"), legacy: { on: true, to: to("admins") } },
  { key: "warrantyNews", label: "Warranty news", about: "A client reported something, or a sub scheduled or finished warranty work.", audience: "team", roles: r("manager", "assignee", "creator", "admins"), legacy: { on: true, to: to("manager", "assignee", "creator") } },
  { key: "warrantyAssigned", label: "Warranty request assigned to you", about: "Someone put a team member on a warranty request.", audience: "team", roles: r("assignee"), legacy: { on: true, to: to("assignee") } },
  // To your subs
  { key: "warrantyToSub", label: "Sub put on a warranty request", about: "The sub hears where, what and who to call when you pick them or change the day.", audience: "sub", roles: [], legacy: { on: false, to: [] } },
  // To your clients
  { key: "selectionReminders", label: "Selection deadlines", about: "A week before a selection is due, and the day it is.", audience: "client", roles: [], legacy: { on: true, to: [] } },
  { key: "warrantyFromSub", label: "Warranty visit scheduled or done by the sub", about: "The client hears the day the sub set, and when the sub marks it done.", audience: "client", roles: [], legacy: { on: true, to: [] } },
];

export type NotifyKey = (typeof NOTIFY_DEFS)[number]["key"];
export type Rule = { on: boolean; to: string[] };
export type Rules = Record<string, Rule>;

/** The company's choices: saved ones, else (never saved) what each did before. */
export function readRules(text: string | null | undefined): { rules: Rules; legacy: boolean } {
  if (text == null) return { rules: Object.fromEntries(NOTIFY_DEFS.map((d) => [d.key, d.legacy])), legacy: true };
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    /* unreadable: all off */
  }
  return {
    rules: Object.fromEntries(
      NOTIFY_DEFS.map((d) => {
        const v = raw[d.key] as { on?: unknown; to?: unknown } | undefined;
        const who = readWho(JSON.stringify(Array.isArray(v?.to) ? v.to : [])).filter((w) => !w.startsWith("role:") || d.roles.some((x) => `role:${x.key}` === w));
        return [d.key, { on: v?.on === true, to: who }];
      }),
    ),
    legacy: false,
  };
}

/** All the choices with one changed — what's saved (every one written, so nothing falls back to before). */
export function withRule(rules: Rules, key: string, rule: Rule): Rules {
  return { ...rules, [key]: rule };
}
