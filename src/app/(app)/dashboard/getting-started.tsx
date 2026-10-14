import Link from "@/components/link";
import { cookies } from "next/headers";
import { CheckCircle2, Circle, X } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/ui";
import { hideGettingStarted } from "./actions";

/** The materials a first wall takeoff adds (code-groups.ts). */
const MATERIAL_KINDS = ["framing lumber", "sheathing", "drywall", "trim"];

// Set by hideGettingStarted (actions.ts).
const GETTING_STARTED_COOKIE = "bs_hide_getting_started";

/**
 * A new company's first steps, ticked off as they're done (worked out from what's there — nothing
 * to keep track of). Admins only; gone once everything's done, once the company has a few jobs,
 * or when hidden.
 */
export async function GettingStarted({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin || (await cookies()).get(GETTING_STARTED_COOKIE)) return null;
  const [company, people, invites, clients, projects, plans, shapes, items, unpriced, costCodes, codedKinds] = await Promise.all([
    db.company.findFirst({ select: { logoPath: true } }),
    db.user.count({ where: { role: { in: ["ADMIN", "STAFF"] } } }),
    db.invite.count(),
    db.client.count(),
    db.project.findMany({ orderBy: { createdAt: "asc" }, select: { id: true }, take: 3 }),
    db.takeoffPlan.count(),
    db.takeoffMeasurement.count(),
    db.materialItem.count(),
    db.materialItem.count({ where: { unitCost: { lte: 0 } } }),
    db.costCode.count(),
    // The kinds of material a first takeoff adds, that have a cost code picked for them.
    db.itemCodeRule.count({ where: { group: { in: MATERIAL_KINDS }, sameForAll: true, costCodeId: { not: null } } }),
  ]);
  // An established company (a few jobs in) doesn't need it.
  if (projects.length > 2) return null;
  const job = projects[0]?.id;
  const steps = [
    { done: !!company?.logoPath, label: "Add your logo", hint: "It goes on proposals, invoices and the client portal.", href: "/settings/company" },
    { done: people > 1 || invites > 0, label: "Invite your team", hint: "Each person gets their own sign-in.", href: "/settings/team" },
    { done: clients > 0, label: "Add your first client", hint: "Clients can follow their job in the portal.", href: "/clients/new" },
    { done: projects.length > 0, label: "Create your first job", hint: "Pick the client, address and kind of job.", href: "/projects/new" },
    { done: plans > 0, label: "Upload plans", hint: "PDF plan sets — then measure right on them.", href: job ? `/projects/${job}/plans` : "/projects" },
    { done: shapes > 0, label: "Draw your first takeoff", hint: "Walls, floors, roofs — materials add themselves.", href: job ? `/projects/${job}/takeoff` : "/projects" },
    // Only for a company with cost codes — which code each kind goes under is theirs to pick.
    ...(costCodes > 0
      ? [
          {
            done: codedKinds >= MATERIAL_KINDS.length,
            label: "Choose cost codes for your materials",
            hint: "Where framing lumber, sheathing, drywall and trim go on your estimates — from your own list.",
            href: "/settings/items#program-items",
          },
        ]
      : []),
    {
      done: items > 0 && unpriced === 0,
      label: "Price your items",
      hint: unpriced ? `${unpriced} item${unpriced === 1 ? "" : "s"} still at $0 — your yard's prices go here.` : "Your Item List prices every takeoff.",
      href: "/settings/items?unpriced=1",
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <Card>
      <CardHeader
        title="Getting started"
        description={`${steps.length - left} of ${steps.length} done — take them in any order.`}
        actions={
          <form action={hideGettingStarted}>
            <button type="submit" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Hide this" aria-label="Hide getting started">
              <X className="h-4 w-4" />
            </button>
          </form>
        }
      />
      <ul className="divide-y divide-slate-100">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
              <span className="min-w-0">
                <span className={s.done ? "text-sm text-slate-400 line-through" : "text-sm font-medium text-slate-900"}>{s.label}</span>
                {s.done ? null : <span className="block text-xs text-slate-500">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
