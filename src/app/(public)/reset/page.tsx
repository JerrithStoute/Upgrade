import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { peekLink } from "@/lib/account";
import { ResetForm } from "../forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const user = await peekLink(token, "RESET_PASSWORD");
  if (!user)
    return (
      <AuthCard title="That link doesn't work any more" intro="Reset links work once, for 1 hour.">
        <Link href="/forgot" className="font-medium text-blue-700 hover:underline">
          Send a new link
        </Link>
      </AuthCard>
    );
  return (
    <AuthCard title="Choose a new password" intro={<>For {user.email}. Any other sign-ins will be signed out.</>}>
      <ResetForm token={token} />
    </AuthCard>
  );
}
