import Link from "@/components/link";
import { CheckList, InviteBand, SiteHeading } from "../parts";

export const metadata = { title: "Pricing" };

// One plan: the whole program, takeoff included.
const INCLUDED = [
  "Plan takeoff: walls, floors, roofs, areas and counts — Find walls and Find area in one click",
  "Lumber lists in the lengths you order, with IRC span tables",
  "Your item list and assemblies",
  "Estimates and proposals",
  "Selections, allowances and change orders",
  "Schedule, daily logs, to-dos, files and messages",
  "Client portal",
  "Bids, purchase orders and vendor bills",
  "Vendor portal and insurance tracking",
  "Budget, invoices, inventory and reports",
  "Time clock with job costing",
  "Leads and spec homes",
  "QuickBooks Desktop sync (Online coming soon)",
];

const QUESTIONS = [
  {
    q: "How many people can use it?",
    a: "Five people from your company are included. Each person after that is $20 a month. Your clients and vendors are always free.",
  },
  { q: "Is the takeoff extra?", a: "No. Everything is included in the one price: takeoff, estimates, scheduling, purchasing, the client portal and the rest." },
  { q: "Is there a contract?", a: "No. Month to month; stop whenever you like." },
  { q: "Do my clients and vendors pay?", a: "No. Their logins are free and unlimited." },
  {
    q: "How long does it take to get set up?",
    a: "You can start your first job the day you sign up. Common lumber sizes are ready on day one, and your items, vendors and cost codes fill in as you work. Uploading your lists is optional.",
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeading title="One price. Everything included." intro="Month to month, with free logins for your clients and vendors." />
      <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="flex flex-col rounded-2xl border-2 border-blue-700 bg-white p-6 shadow-lg">
          <h2 className="text-xl font-semibold">The Builder Station</h2>
          <p className="mt-2 text-sm text-slate-600">For builders running jobs from the first takeoff to closeout.</p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">$299</p>
          <p className="text-sm text-slate-500">per company, per month · 5 users included, $20 a month for each one after</p>
          <Link href="/site/request-invite" className="mt-6 rounded-md bg-blue-700 px-4 py-2.5 text-center font-medium text-white hover:bg-blue-800">
            Request an invite
          </Link>
          <CheckList className="mt-6 text-sm text-slate-700" items={INCLUDED} />
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
