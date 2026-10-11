import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { peekLink } from "@/lib/account";
import { ConfirmForm } from "../forms";

export const metadata = { title: "Confirm your email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const user = await peekLink(token, "VERIFY_EMAIL");
  if (!user)
    return (
      <AuthCard title="That link doesn't work any more" intro="Confirmation links work once, for 3 days. Try signing in — we'll offer to send a new one.">
        <Link href="/login" className="font-medium text-blue-700 hover:underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  return (
    <AuthCard title="Confirm your email" intro={<>Hi {user.name.split(" ")[0]} — confirm that {user.email} is yours and you&apos;re in.</>}>
      <ConfirmForm token={token} />
    </AuthCard>
  );
}
