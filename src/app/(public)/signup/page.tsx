import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "./signup-form";
import { robotCheckKey } from "@/lib/turnstile";

export const metadata = { title: "Start free" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Start your company"
      intro="Estimates, takeoffs, schedules, budgets and your clients — in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm robotKey={robotCheckKey()} />
    </AuthCard>
  );
}
