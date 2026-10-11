import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readTwoStep } from "@/lib/two-step";
import { CodeForm } from "./forms";

export const metadata = { title: "Two-step sign-in" };

export default async function TwoStepPage() {
  const pending = await readTwoStep();
  if (!pending) redirect("/login");
  if (pending.step === "setup") redirect("/login/two-step/setup");
  return (
    <AuthCard
      title="One more step"
      intro="Open your authenticator app and type the 6-digit code for The Builder Station."
      footer={
        <Link href="/logout" className="font-medium text-blue-700 hover:underline">
          Cancel
        </Link>
      }
    >
      <CodeForm />
    </AuthCard>
  );
}
