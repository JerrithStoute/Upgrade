import Link from "@/components/link";
import { CheckList, InviteBand, SiteHeading } from "../parts";

export const metadata = { title: "Pricing" };

// Prices aren't set yet — each plan says "Pricing coming soon". (What's in each plan is a draft too.)
const PLANS = [
  {
    name: "Takeoff",
    for: "For estimators and builders who want faster, more accurate takeoffs.",
    items: ["Plan takeoff: walls, floors, roofs, areas and counts", "Lumber lists in the lengths you order", "IRC span tables", "Your item list and assemblies", "Unlimited users"],
  },
  {
    name: "Builder",
    for: "For builders running jobs from estimate to closeout.",
    featured: true,
    items: [
      "Everything in Takeoff",
      "Estimates and proposals",
      "Schedule and daily logs",
      "Budget, change orders and invoices",
      "Selections and allowances",
      "Client portal",
      "Leads, files, messages and to-dos",
      "Unlimited users",
    ],
  },
  {
    name: "Builder Pro",
    for: "For builders who buy, bill and track labor in the program.",
    items: ["Everything in Builder", "Bids, purchase orders and vendor bills", "Vendor portal and insurance tracking", "Time clock with job costing", "Inventory and reports", "QuickBooks sync (coming)", "Unlimited users"],
  },
];

const QUESTIONS = [
  { q: "How many people can use it?", a: "As many as you have. Every plan includes unlimited users — no per-seat fees." },
  { q: "Is there a contract?", a: "No. Month to month; stop whenever you like." },
  { q: "Do my clients and vendors pay?", a: "No. Their logins are free and unlimited." },
  {
    q: "How long does it take to get set up?",
    a: "You can start your first job the day you sign up. Common lumber sizes are ready on day one, and your items, vendors and cost codes fill in as you work. Uploading your lists is optional.",
  },
  { q: "When will prices be announced?", a: "Soon. Request an invite and you'll hear first." },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeading title="Simple plans. Unlimited users." intro="Every plan is month to month, with free logins for your clients and vendors." />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className={p.featured ? "relative flex flex-col rounded-2xl border-2 border-blue-700 bg-white p-6 shadow-lg" : "flex flex-col rounded-2xl border border-slate-200 bg-white p-6"}>
              {p.featured ? <span className="absolute -top-3 left-6 rounded-full bg-blue-700 px-3 py-0.5 text-xs font-medium text-white">Most builders</span> : null}
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-2 min-h-12 text-sm text-slate-600">{p.for}</p>
              <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Pricing coming soon</p>
              <p className="text-sm text-slate-500">per company, per month</p>
              <Link
                href="/site/request-invite"
                className={
                  p.featured
                    ? "mt-6 rounded-md bg-blue-700 px-4 py-2.5 text-center font-medium text-white hover:bg-blue-800"
                    : "mt-6 rounded-md px-4 py-2.5 text-center font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                }
              >
                Request an invite
              </Link>
              <CheckList className="mt-6 text-sm text-slate-700" items={p.items} />
            </div>
          ))}
        </div>
      </section>
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-8 space-y-6">
            {QUESTIONS.map((x) => (
              <div key={x.q}>
                <dt className="font-medium">{x.q}</dt>
                <dd className="mt-1 text-slate-600">{x.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <InviteBand />
    </>
  );
}
