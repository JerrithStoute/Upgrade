import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { readSetupLink } from "@/lib/station-auth";
import { StationPasswordForm } from "../forms";

export const metadata = { title: "Set up your Station sign-in" };

/** From a setup link (a new person, or a new link from the owner): a password, then the authenticator app. */
export default async function StationSetupPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const user = await readSetupLink(t);
  if (!user)
    return (
      <AuthCard home="/station/login" title="This link doesn't work" intro="It's been used, or it's too old. Ask The Builder Station's owner for a new one.">
        <Link href="/station/login" className="text-sm font-medium text-blue-700 hover:underline">
          Station sign-in →
        </Link>
      </AuthCard>
    );
  return (
    <AuthCard home="/station/login" title={`Welcome, ${user.name.split(" ")[0]}`} intro={`Set a password for ${user.email} on The Builder Station · Station. Next you'll set up a code from your phone.`}>
      <StationPasswordForm token={t} />
    </AuthCard>
  );
}
