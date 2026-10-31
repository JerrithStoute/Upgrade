import Link from "@/components/link";
import { cookies } from "next/headers";
import { CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/ui";
import { hideGettingStarted } from "./actions";
import { addSample } from "../projects/sample-actions";
import { findSampleJob } from "@/lib/sample-job";

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
  const [company, people, invites, clients, projects, plans, shapes, items, unpriced, costCodes, codedKinds, rechecked, sample] = await Promise.all([
    db.company.findFirst({ select: { logoPath: true } }),
    db.user.count({ where: { role: { in: ["ADMIN", "STAFF"] } } }),
    db.invite.count(),
    db.client.count({ where: { isSample: false } }),
    db.project.findMany({ where: { isTemplate: false, isSample: false }, orderBy: { createdAt: "asc" }, select: { id: true }, take: 3 }),
    db.takeoffPlan.count(),
    db.takeoffMeasurement.count(),
    db.materialItem.count(),
    db.materialItem.count({ where: { unitCost: { lte: 0 } } }),
    db.costCode.count(),
    // The kinds of material a first takeoff adds, that have a cost code picked for them.
    db.itemCodeRule.count({ where: { group: { in: MATERIAL_KINDS }, sameForAll: true, costCodeId: { not: null } } }),
    // Cost codes with a "recheck prices every …" time — theirs to set, none set for them.
    db.costCode.count({ where: { priceRecheckEvery: { gt: 0 } } }),
    findSampleJob(),
  ]);
  // An established company (a few jobs in) doesn't need it.
  if (projects.length > 2) return null;
  const job = projects[0]?.id;
  const steps = [
    { done: !!company?.logoPath, label: "Add your logo", hint: "It goes on proposals, invoices and the client portal.", href: "/settings/company" },
    { done: people > 1 || invites > 0, label: "Invite your team", hint: "Each person gets their own sign-in.", href: "/team" },
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
            href: "/catalog/items#program-items",
          },
        ]
      : []),
    {
      done: items > 0 && unpriced === 0,
      label: "Price your items",
      hint: unpriced ? `${unpriced} item${unpriced === 1 ? "" : "s"} still at $0 — your yard's prices go here.` : "Your Item List prices every takeoff.",
      href: "/catalog/items?unpriced=1",
    },
    ...(costCodes > 0
      ? [
          {
            done: rechecked > 0,
            label: "Set how often to recheck prices",
            hint: "On each cost code: lumber every few weeks, windows every 6 months… Old prices get flagged before you bid with them.",
            href: "/settings/cost-codes",
          },
        ]
      : []),
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
      {/* The sample job (sample-job.ts): a made-up house to click through first — or, removed, to add again. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-amber-50/60 px-4 py-2.5 text-sm">
        {sample ? (
          <>
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            <Link href={`/projects/${sample.id}`} className="font-medium text-blue-700 hover:underline">
              Explore the sample job
            </Link>
            <span className="text-xs text-slate-500">A made-up house with everything filled in — try anything.</span>
          </>
        ) : (
          <form action={addSample} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            <button type="submit" className="font-medium text-blue-700 hover:underline">
              Add a sample job
            </button>
            <span className="text-xs text-slate-500">A made-up house to explore, with everything filled in. Remove it any time.</span>
          </form>
        )}
      </div>
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
