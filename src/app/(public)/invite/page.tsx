import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { systemDb } from "@/lib/db";
import { hashToken } from "@/lib/account";
import { InviteForm } from "../forms";
import { brandForCompany } from "@/lib/customer-brand";
import { appIdentityForCompany, customerPageMetadata } from "@/lib/app-identity";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const invite = token ? await systemDb.invite.findUnique({ where: { tokenHash: hashToken(token) }, select: { companyId: true, kind: true } }) : null;
  const customer = invite && (invite.kind === "CLIENT" || invite.kind === "VENDOR") ? invite : null;
  const [app, brand] = customer ? await Promise.all([appIdentityForCompany(customer.companyId, customer.kind), brandForCompany(customer.companyId)]) : [null, null];
  return customerPageMetadata(app, "Accept invitation", brand?.logoUrl);
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const invite = token ? await systemDb.invite.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
  const company = invite ? await systemDb.company.findUnique({ where: { id: invite.companyId }, select: { name: true } }) : null;
  if (!invite || !company || invite.acceptedAt || invite.expiresAt < new Date())
    return (
      <AuthCard title="That invitation doesn't work any more" intro="Invitations work once, for 7 days. Ask whoever invited you to send a new one.">
        <Link href="/login" className="font-medium text-blue-700 hover:underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  const what = invite.kind === "CLIENT" ? "your client portal" : invite.kind === "VENDOR" ? "the vendor portal" : "the team";
  // A client or sub sees their builder's logo, not The Builder Station's.
  const brand = invite.kind === "CLIENT" || invite.kind === "VENDOR" ? await brandForCompany(invite.companyId) : null;
  return (
    <AuthCard brand={brand} title={`Join ${company.name}`} intro={`You're invited to ${what}. Choose a password to get started.`}>
      <InviteForm token={token} email={invite.email} name={invite.name ?? ""} />
    </AuthCard>
  );
}
