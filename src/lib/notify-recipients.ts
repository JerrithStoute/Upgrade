import "server-only";
import { db } from "./db";
import { resolveAccess } from "./access";
import { readWho } from "./paperwork";
import { readRules } from "./notify-rules";

/** The company's email choices (notify-rules.ts). */
export async function companyRules() {
  const c = await db.company.findFirst({ select: { notifyRules: true } });
  return readRules(c?.notifyRules);
}

/** Whether an email to a client or sub is on. */
export async function notifyOn(key: string) {
  return (await companyRules()).rules[key]?.on === true;
}

// Before it was a choice, these went to the admins when nobody else was named (no manager on the job…).
const ADMINS_IF_NOBODY = new Set(["proposalAnswered", "coAnswered", "selectionChosen", "clientMessage", "bidAnswered", "warrantyNews"]);

/**
 * Who on the team gets this email: nobody when it's off; else the people its choice names — by name, by
 * position, or worked out (`given`: the user ids for "whoever sent it", "the job's manager"… this time).
 * Active team members with a real address only.
 */
export async function teamRecipients(key: string, given: Partial<Record<string, (string | null | undefined)[]>> = {}): Promise<string[]> {
  const { rules, legacy } = await companyRules();
  const rule = rules[key];
  if (!rule?.on) return [];
  const ids = new Set<string>();
  const positions = new Set<string>();
  let everyone = false;
  const add = (who: string[]) => {
    for (const w of who) {
      const [kind, id] = w.split(":");
      if (kind === "user") ids.add(id);
      else if (kind === "pos") positions.add(id);
    }
  };
  add(rule.to);
  for (const w of rule.to.filter((x) => x.startsWith("role:"))) {
    const role = w.slice(5);
    if (role === "everyone") everyone = true;
    else if (role === "admins") for (const u of await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })) ids.add(u.id);
    else if (role === "owner") add(readWho((await db.company.findFirst({ select: { paperworkOwner: true } }))?.paperworkOwner));
    else if (role === "timeFixers") {
      const team = await db.user.findMany({
        where: { active: true, role: { in: ["ADMIN", "STAFF"] } },
        select: { id: true, role: true, access: true, position: { select: { access: true } } },
      });
      for (const u of team) if (resolveAccess(u.role, u.position?.access, u.access).time >= 2) ids.add(u.id);
    } else for (const id of given[role] ?? []) if (id) ids.add(id);
  }
  const people = await db.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "STAFF"] }, ...(everyone ? {} : { OR: [{ id: { in: [...ids] } }, { positionId: { in: [...positions] } }] }) },
    select: { email: true },
  });
  let emails = people.map((u) => u.email).filter((e) => !e.endsWith(".invalid"));
  if (!emails.length && legacy && ADMINS_IF_NOBODY.has(key))
    emails = (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } })).map((u) => u.email);
  return [...new Set(emails)];
}
