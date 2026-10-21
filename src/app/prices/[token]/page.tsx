import { StationLine } from "@/components/station-logo";
import { isLadderLine } from "@/lib/bids";
import { BID_LINK_DAYS } from "@/lib/bid-link";
import { bidForLink } from "../data";
import { PricesForm } from "./form";

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
  const address = [bid.project.address, [bid.project.city, bid.project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const lines = bid.lines.map((l) => ({ id: l.id, name: l.name, unit: l.unit, quantity: l.quantity, ladder: isLadderLine(l), price: l.unitPrice, substitute: l.substitute }));
  return (
    <Shell>
      <p className="text-sm font-semibold text-slate-500">{company?.name}</p>
      <h1 className="mt-1 text-xl font-semibold text-slate-900">Your prices — Bid #{bid.number}</h1>
      <div className="mt-2 space-y-0.5 text-sm text-slate-600">
        <p>For: {bid.vendorName}</p>
        <p>
          Job #{bid.project.number} — {bid.project.name}
        </p>
        {address ? <p>Deliver to: {address}</p> : null}
        {bid.notes ? <p className="text-slate-800">Note: {bid.notes}</p> : null}
      </div>
      {closed ? (
        <p className="mt-5 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">This bid has been decided — thank you. Questions? Reply to the email you got.</p>
      ) : (
        <PricesForm token={token} lines={lines} company={company?.name ?? "the builder"} />
      )}
      <p className="mt-6 text-xs text-slate-400">
        Questions? Reply to the email you got{company?.phone ? `, or call ${company.phone}` : ""}.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex-1 bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <StationLine size={26} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">{children}</div>
      </div>
    </main>
  );
}
