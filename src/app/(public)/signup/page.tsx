import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "./signup-form";
import { robotCheckKey } from "@/lib/turnstile";
import { readBuilderInvite } from "@/lib/builder-invites";

export const metadata = { title: "Start your company" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite: token } = await searchParams;
  const invite = await readBuilderInvite(token);
  const footer = (
    <>
      Already have an account?{" "}
      <Link href="/login" className="font-medium text-blue-700 hover:underline">
        Sign in
      </Link>
    </>
  );
  // Invite-only for now (src/lib/builder-invites.ts).
  if (!invite || !token)
    return (
      <AuthCard title="By invitation for now" intro="The Builder Station is opening to builders a few at a time." footer={footer}>
        <p className="text-sm text-slate-700">
          {token ? "This sign-up link isn't valid any more — invitations last 14 days. " : ""}Ask the person who told you about The Builder Station for an invitation; it comes as
          an email with your own sign-up link.
        </p>
      </AuthCard>
    );
  return (
    <AuthCard title="Start your company" intro="Estimates, takeoffs, schedules, budgets and your clients — in one place." footer={footer}>
      <SignUpForm robotKey={robotCheckKey()} invite={{ token, ...invite }} />
    </AuthCard>
  );
}
