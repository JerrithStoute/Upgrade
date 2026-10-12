import { CheckList, InviteBand, Shot, SiteHeading } from "../parts";

export const metadata = { title: "Features" };

type Group = { id: string; title: string; intro: string; items: string[]; shot?: "rafters" | "takeoff" | "estimate" | "schedule" };

const GROUPS: Group[] = [
  {
    id: "takeoff",
    title: "Takeoff",
    intro: "Measure right on the plan set. Every line you draw turns into material.",
    shot: "takeoff",
    items: [
      "Upload the plans; scale each page once",
      "Walls found on the plan for you — check them instead of drawing them all",
      "Studs, plates, headers, blocking, sheathing and drywall from each wall",
      "Joist and rafter areas laid out at your spacing and direction",
      "The current IRC span tables at hand when you want a size suggested",
      "Lumber in the lengths you actually order, with waste where it belongs",
      "Areas, lengths and counts for everything else on the plan",
    ],
  },
  {
    id: "estimate",
    title: "Estimates",
    intro: "Your estimate, organized your way — priced from the takeoff and your own items.",
    shot: "estimate",
    items: [
      "Divisions, categories and items",
      "Clients see categories; item detail stays internal",
      "Your own item list and assemblies, built as you go",
      "Markup, margin and tax set for the job, or line by line",
      "Allowances and selections in the estimate",
      "Your cost codes, or none — your call",
    ],
  },
  {
    id: "schedule",
    title: "Schedule",
    intro: "One schedule for you, your crew, your subs and your client.",
    shot: "schedule",
    items: ["Phases and tasks with dependencies", "Subs see their own dates in the vendor portal", "Clients see what's next in the client portal", "Daily logs with notes, photos and weather"],
  },
  {
    id: "budget",
    title: "Budget & purchasing",
    intro: "The estimate becomes the budget the day the job is sold.",
    items: [
      "Estimated, committed and actual by cost code",
      "Bid packages to your subs and suppliers",
      "Purchase orders and vendor bills against the budget",
      "Change orders that update the estimate, budget and invoices",
      "Invoices to the client and payments received",
      "Time clock hours costed to the job",
    ],
  },
  {
    id: "clients",
    title: "Clients & vendors",
    intro: "Give everyone a login — free — instead of a phone call.",
    items: [
      "Client portal: schedule, selections, change orders, invoices, files and messages",
      "Clients approve selections and sign change orders online",
      "Vendor portal: purchase orders, schedule, bills and insurance certificates",
      "Leads from first call to signed contract",
    ],
  },
  {
    id: "team",
    title: "Your team",
    intro: "Unlimited users, with the right access for each.",
    items: ["Admins and staff, each with their own login", "Time clock on the phone, to the job and cost code", "To-dos and punch lists", "Two-step sign-in available for everyone"],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SiteHeading title="Everything a home builder runs a job with." intro="Takeoff, estimate, schedule, budget, purchasing and your clients — in one program, sharing one job." />
      <nav className="sticky top-16 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 text-sm sm:px-6">
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="shrink-0 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {g.title}
            </a>
          ))}
        </div>
      </nav>
      <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6">
        {GROUPS.map((g, i) => (
          <section key={g.id} id={g.id} className="scroll-mt-32">
            <div className={g.shot ? "grid items-center gap-10 lg:grid-cols-2" : "max-w-3xl"}>
              <div className={g.shot && i % 2 ? "lg:order-2" : undefined}>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{g.title}</h2>
                <p className="mt-3 text-slate-600">{g.intro}</p>
                <CheckList className="mt-5 text-slate-700" items={g.items} />
              </div>
              {g.shot ? <Shot shot={g.shot} className={i % 2 ? "lg:order-1" : undefined} /> : null}
            </div>
          </section>
        ))}
        <p className="text-sm text-slate-500">Coming next: QuickBooks sync.</p>
      </div>
      <InviteBand />
    </>
  );
}
