import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { systemDb } from "@/lib/db";
import { hashToken } from "@/lib/account";
import { InviteForm } from "../forms";

export const metadata = { title: "Accept invitation" };

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
  return (
    <AuthCard title={`Join ${company.name}`} intro={`You're invited to ${what}. Choose a password to get started.`}>
      <InviteForm token={token} email={invite.email} name={invite.name ?? ""} />
    </AuthCard>
  );
}
