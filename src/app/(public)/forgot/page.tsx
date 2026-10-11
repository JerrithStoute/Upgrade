import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ForgotForm } from "../forms";
import { robotCheckKey } from "@/lib/turnstile";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      intro="Put in your email and we'll send a link to choose a new one."
      footer={
        <Link href="/login" className="font-medium text-blue-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm robotKey={robotCheckKey()} />
    </AuthCard>
  );
}
