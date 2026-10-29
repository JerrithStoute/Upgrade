import { CalendarDays, ClipboardList, FileText, HardHat, MessageSquare, Package, Receipt, ShoppingCart, Timer, Truck, UserPlus, Users } from "lucide-react";
import Link from "@/components/link";
import { CheckList, InviteBand, Shot } from "./parts";

export const metadata = { title: { absolute: "The Builder Station — takeoffs, estimates and schedules for home builders" } };

const EVERYTHING_ELSE = [
  { icon: Users, title: "Client portal", text: "Clients see their schedule, selections, change orders, invoices and files — and message you there." },
  { icon: Truck, title: "Vendor portal", text: "Subs and suppliers see their purchase orders and schedule, send bills, and keep insurance current." },
  { icon: ClipboardList, title: "Selections & allowances", text: "Choices, allowances and what's over or under, signed off by the client." },
  { icon: FileText, title: "Change orders", text: "Priced, sent, and approved online — and they land in the budget." },
  { icon: ShoppingCart, title: "Bids & purchasing", text: "Bid packages, purchase orders and bills, all tied to the job's budget." },
  { icon: Receipt, title: "Invoices", text: "Bill the client by draw or by change order, and see what's been paid." },
  { icon: Timer, title: "Time clock", text: "Your crew clocks in on their phone, to the job and the cost code." },
  { icon: CalendarDays, title: "Daily logs", text: "What happened on site, with photos and weather, for every day." },
  { icon: UserPlus, title: "Leads", text: "Every prospect from first call to signed contract — then it becomes the job." },
  { icon: Package, title: "Plans & files", text: "Plan sets, photos and documents, kept with the job and shared when you say." },
  { icon: MessageSquare, title: "Messages", text: "Conversations with clients and vendors stay with the job, not in your texts." },
  { icon: HardHat, title: "To-dos", text: "Punch lists and reminders for you and your team." },
];

export default function SiteHome() {
  return (
    <>
      {/* The pitch */}
      <section className="overflow-hidden">
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div>
            <p className="text-sm font-medium text-blue-700">Built by a custom home builder, for builders</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">From the plans to the keys, in one place.</h1>
            <p className="mt-5 text-lg text-slate-600">
              Measure the plans, price the job, run the schedule, buy the materials and keep your clients in the loop — without five programs and a spreadsheet holding it
              together.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/site/request-invite" className="rounded-md bg-blue-700 px-5 py-3 font-medium text-white shadow-sm hover:bg-blue-800">
                Request an invite
              </Link>
              <Link href="/site/features" className="rounded-md px-5 py-3 font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                See what it does
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500">Unlimited users · No contract · Free logins for clients and vendors</p>
          </div>
          <Shot shot="rafters" priority />
        </div>
      </section>

      {/* The three big jobs */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl space-y-20 px-4 py-20 sm:px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-blue-700">Takeoff</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Draw the walls once. Get the lumber list.</h2>
              <p className="mt-4 text-slate-600">Open the plan set, trace the walls, floors and roof, and the takeoff counts it for you.</p>
              <CheckList
                className="mt-5 text-slate-700"
                items={[
                  "Walls found on the plan for you — check them, don't draw them all",
                  "Studs, plates, headers, sheathing and drywall from every wall",
                  "Joists and rafters laid out at your spacing, with the current IRC span tables at hand",
                  "Your waste and your lumber lengths, the way you order",
                ]}
              />
            </div>
            <Shot shot="takeoff" />
          </div>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="lg:order-2">
              <p className="text-sm font-medium text-blue-700">Estimate</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">The takeoff prices the estimate.</h2>
              <p className="mt-4 text-slate-600">Quantities flow straight from the takeoff into your items and prices — change the plan and the estimate follows.</p>
              <CheckList
                className="mt-5 text-slate-700"
                items={[
                  "Divisions, categories and items, organized the way you think",
                  "Clients see clean categories; your item detail stays yours",
                  "Your markup, allowances and selections in the same place",
                  "A clean proposal for the client, from the same numbers",
                ]}
              />
            </div>
            <Shot shot="estimate" className="lg:order-1" />
          </div>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-blue-700">Schedule & budget</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Know where the job stands — and where the money went.</h2>
              <p className="mt-4 text-slate-600">The estimate becomes the budget. Purchase orders, bills and change orders keep it honest all the way to closeout.</p>
              <CheckList
                className="mt-5 text-slate-700"
                items={[
                  "A schedule your clients and subs can see",
                  "Estimated against committed against actual, by cost code",
                  "Purchase orders and bills tied to the budget",
                  "Change orders that update everything they touch",
                ]}
              />
            </div>
            <Shot shot="schedule" />
          </div>
        </div>
      </section>

      {/* Everything else */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">And the rest of running a job.</h2>
          <p className="mt-3 max-w-2xl text-slate-600">All of it in the same program, sharing the same job — nothing to re-type.</p>
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {EVERYTHING_ELSE.map((f) => (
              <div key={f.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it's easy to start */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Easy to start. Easy to stay.</h2>
            <p className="mt-3 text-slate-600">No month of setup before your first estimate. Your lists fill in as you work.</p>
          </div>
          <CheckList
            className="text-slate-700"
            items={[
              "Unlimited users — bring your whole team, no per-seat fees",
              "Month to month — no annual contract",
              "Clients and vendors log in free",
              "Common lumber sizes ready on day one — just add your prices",
              "Your items, vendors and cost codes build up from normal work; uploading lists is optional",
              "Works on your phone in the field",
            ]}
          />
        </div>
      </section>

      <InviteBand />
    </>
  );
}
