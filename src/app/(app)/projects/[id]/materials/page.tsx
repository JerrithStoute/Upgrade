import Link from "@/components/link";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { cn, fmtDate, money } from "@/lib/utils";
import { ListFind } from "@/components/list-find";
import { jobSubstitutions } from "@/lib/substitutions";
import { swapBackSubstitution } from "../takeoff/actions";
import { PrintButton } from "../_components/print-button";
import { CutSheet, MaterialTable } from "../takeoff/_components/material-table";
import { getBrand } from "@/lib/company-brand";
import { PrintLogo } from "@/components/brand-mark";
import { jobPulls } from "@/lib/inventory";
import { answerInventory } from "./inventory/actions";
import { stalePrices } from "@/lib/stale-prices";

/** The job's material list: its own project tab, printable with or without prices. */
export default async function MaterialListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string; prices?: string }> }) {
  await requireView("takeoffs");
  const { id } = await params;
  const { plan: planParam, prices } = await searchParams;
  const project = await getProject(id);
  const plans = await db.takeoffPlan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const planId = plans.some((p) => p.id === planParam) ? planParam! : null;
  const showPrices = prices !== "0";
  const [{ lines, cutLists, total }, substitutions] = await Promise.all([buildMaterialList(project.id, planId), jobSubstitutions(project.id)]);
  const [brand, pulls, stocked] = await Promise.all([getBrand(), jobPulls(project.id), db.inventoryItem.count({ where: { onHand: { gt: 0 } } })]);
  // In contract (sold, or prices locked) and not asked yet: offer the company's inventory before anything's ordered.
  const inContract = !!project.pricesLockedAt || ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"].includes(project.status);
  const askInventory = inContract && !project.inventoryAnswer && stocked > 0;
  const pulledFor = planId ? undefined : Object.fromEntries(pulls);
  // A locked job keeps its own prices, so the Item List's age doesn't reach it.
  const stale = project.pricesLockedAt ? undefined : Object.fromEntries(await stalePrices(lines.map((l) => l.materialItemId)));

  const base = `/projects/${project.id}/materials`;
  const href = (o: { plan?: string | null; prices?: boolean }) => {
    const q = new URLSearchParams();
    const plan = o.plan === undefined ? planId : o.plan;
    if (plan) q.set("plan", plan);
    if (!(o.prices ?? showPrices)) q.set("prices", "0");
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const csvHref = `/projects/${project.id}/takeoff/materials/csv${planId ? `?plan=${planId}` : ""}${planId ? "&" : "?"}prices=${showPrices ? "1" : "0"}`;
  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
      active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
    );
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");

  const link = "text-xs font-medium text-blue-700 hover:underline";

  return (
    <div className="space-y-4">
      {/* On paper: the logo, then what this list is, for whom, and when. */}
      <div className="hidden print:block">
        <PrintLogo logoUrl={brand.logoUrl} />
        <h2 className="text-lg font-semibold text-slate-900">Material list</h2>
        <p className="text-sm text-slate-500">
          #{project.number} {project.name}
          {address ? ` · ${address}` : ""} · {planId ? plans.find((p) => p.id === planId)?.name : "All plans"} · {fmtDate(new Date())}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <header className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="material-list" placeholder="Find an item…" />
          {/* Prices on or off — off for a list to send a supplier. The printout and CSV follow it. */}
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-medium" role="group" aria-label="Prices">
            <Link href={href({ prices: true })} className={cn("px-2.5 py-1", showPrices ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}>
              Prices
            </Link>
            <Link href={href({ prices: false })} className={cn("px-2.5 py-1", !showPrices ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}>
              No prices
            </Link>
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-3">
            <Link href={`${base}/inventory`} className={link} title="Use your stored materials on this job — the list orders that much less">
              Pull from inventory
            </Link>
            <a href={csvHref} className={link}>
              CSV
            </a>
            <PrintButton asLink />
            <Link
              href={`/projects/${project.id}/bids`}
              className="inline-flex h-7 items-center rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
              title="Send the list (or part of it) to vendors for prices — as Excel or a printout — bring their prices back, compare, and take one per cost code"
            >
              Send to vendors
            </Link>
          </span>
        </header>
        {plans.length > 1 ? (
          <div className="no-print flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2">
            <Link href={href({ plan: null })} className={chip(!planId)}>
              All plans
            </Link>
            {plans.map((p) => (
              <Link key={p.id} href={href({ plan: p.id })} className={chip(planId === p.id)}>
                {p.name}
              </Link>
            ))}
          </div>
        ) : null}
        <p className="no-print border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Everything your takeoffs order, waste included; an item used by several takeoffs is combined and rounded up once. Prices are this job&apos;s costs, before markup.{" "}
          {project.pricesLockedAt ? (
            <span className="font-medium text-amber-800">Prices locked {fmtDate(project.pricesLockedAt)}: a price you change here stays on this job.</span>
          ) : (
            <>Click a price to change it in the Item List (and every job that isn&apos;t locked); the pin keeps a price for this job only.</>
          )}{" "}
          <Link href={`/projects/${project.id}/takeoff/rebid`} className="font-medium text-blue-700 hover:underline">
            {project.pricesLockedAt ? "Price review / unlock" : "Price review / lock"}
          </Link>
        </p>

        {askInventory ? (
          <form action={answerInventory} className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-blue-50 px-4 py-2 text-xs text-blue-900">
            <input type="hidden" name="projectId" value={project.id} />
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">This job is in contract.</strong> Pull anything from your inventory before you order?
            </span>
            <button type="submit" name="answer" value="YES" className="font-semibold text-blue-800 hover:underline">
              Yes, show inventory
            </button>
            <button type="submit" name="answer" value="NO" className="text-blue-800 hover:underline">
              No, order everything
            </button>
          </form>
        ) : null}

        {substitutions.length ? (
          // What this job orders instead — each with its way back.
          <ul className="no-print border-b border-slate-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
            {substitutions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 py-0.5">
                <span>
                  Substitution: <strong className="font-semibold">{s.toName}</strong> instead of {s.fromName} · {s.source ?? "you"}
                  {s.unitCost != null && showPrices ? ` · ${money(s.unitCost)}` : ""}
                </span>
                <form action={swapBackSubstitution}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="back" value={href({})} />
                  <button type="submit" className="font-medium underline hover:text-amber-700">
                    Swap back
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <div id="material-list">
          <MaterialTable
            lines={lines}
            total={total}
            showPrices={showPrices}
            pulled={pulledFor}
            stale={showPrices ? stale : undefined}
            edit={{ projectId: project.id, locked: !!project.pricesLockedAt, substitutions: substitutions.map((s) => ({ fromName: s.fromName, toName: s.toName })) }}
          />
        </div>
      </section>

      <CutSheet cutLists={cutLists} />
    </div>
  );
}
