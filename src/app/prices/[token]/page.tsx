import { StationLine } from "@/components/station-logo";
import { isLadderLine } from "@/lib/bids";
import { BID_LINK_DAYS } from "@/lib/bid-link";
import { bidForLink } from "../data";
import { PricesForm, SubBidForm } from "./form";

export const metadata = { title: "Your prices", robots: { index: false, follow: false } };

/**
 * Where a vendor types their prices for a bid — from the link in its email, no sign-in. Their list (with
 * any prices they already sent), a price box on each line, and Send.
 */
export default async function BidPricesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await bidForLink(token);
  if (!found)
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-slate-900">This link doesn&apos;t work any more</h1>
        <p className="mt-2 text-sm text-slate-600">
          Price links work for {BID_LINK_DAYS} days. Reply to the email you got instead — or fill in the attached Excel file or PDF and send it back.
        </p>
      </Shell>
    );
  const { bid, company, closed } = found;
  if (bid.kind === "SUB") return <SubBidPage token={token} found={found} />;
  const address = [bid.project.address, [bid.project.city, bid.project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const lines = bid.lines.map((l) => ({
    id: l.id,
    name: l.name,
    unit: l.unit,
    quantity: l.quantity,
    ladder: isLadderLine(l),
    price: l.unitPrice,
    substitute: l.substitute,
  }));
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-slate-900">
        {company?.name} — prices for Bid #{bid.number}
      </h1>
      <p className="mt-0.5 text-xs text-slate-600">
        {bid.vendorName} · Job #{bid.project.number} {bid.project.name}
        {address ? ` · Deliver to ${address}` : ""}
      </p>
      {bid.notes ? <p className="mt-1 text-xs text-slate-800">Note: {bid.notes}</p> : null}
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
        <span className="text-slate-500">Rather use your own sheet?</span>
        <a href={`/prices/${token}/file?kind=xlsx`} className="font-medium text-blue-700 hover:underline">
          Download the Excel file
        </a>
        <a href={`/prices/${token}/file?kind=pdf`} target="_blank" rel="noopener" className="font-medium text-blue-700 hover:underline">
          PDF to print
        </a>
      </p>
      {closed ? (
        <p className="mt-5 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This bid has been decided — thank you. Questions? Reply to the email you got.
        </p>
      ) : (
        <PricesForm token={token} lines={lines} company={company?.name ?? "the builder"} attached={!!bid.returnFileId} />
      )}
      <p className="mt-3 text-xs text-slate-400">Questions? Reply to the email you got{company?.phone ? `, or call ${company.phone}` : ""}.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex-1 bg-slate-100 px-3 pb-28 pt-3 sm:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2">
          <StationLine size={22} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">{children}</div>
      </div>
    </main>
  );
}

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A sub's bid page: the job, what's asked and by when, the plans to open or download, and their price per trade. */
function SubBidPage({ token, found }: { token: string; found: NonNullable<Awaited<ReturnType<typeof bidForLink>>> }) {
  const { bid, company, closed, plans } = found;
  const address = [bid.project.address, [bid.project.city, bid.project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const trades = bid.lines.map((l) => ({ id: l.id, name: l.codeLabel || l.name, price: l.unitPrice, note: l.note }));
  const due = bid.dueAt ? bid.dueAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-slate-900">
        {company?.name} — bid request #{bid.number}
      </h1>
      <p className="mt-0.5 text-xs text-slate-600">
        {bid.vendorName} · Job #{bid.project.number} {bid.project.name}
        {address ? ` · ${address}` : ""}
      </p>
      <p className="mt-1 text-sm text-slate-800">
        Your bid for <b>{trades.map((t) => t.name).join(", ")}</b>
        {due ? (
          <>
            {" "}
            — due <b>{due}</b>
          </>
        ) : null}
      </p>
      {bid.notes ? <p className="mt-1 text-xs text-slate-800">Note: {bid.notes}</p> : null}
      {plans.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The plans ({plans.length})</p>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {plans.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
                <a href={`/prices/${token}/plan/${f.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 font-medium text-blue-700 hover:underline">
                  {f.name}
                </a>
                <span className="text-xs text-slate-500">{fileSize(f.size)}</span>
                <a href={`/prices/${token}/plan/${f.id}?download=1`} className="text-xs font-medium text-blue-700 hover:underline">
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {closed ? (
        <p className="mt-5 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This bid has been decided — thank you. Questions? Reply to the email you got.
        </p>
      ) : (
        <SubBidForm token={token} trades={trades} company={company?.name ?? "the builder"} attached={!!bid.returnFileId} />
      )}
      <p className="mt-3 text-xs text-slate-400">Questions? Reply to the email you got{company?.phone ? `, or call ${company.phone}` : ""}.</p>
    </Shell>
  );
}
