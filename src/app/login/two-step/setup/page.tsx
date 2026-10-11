import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readTwoStep } from "@/lib/two-step";
import { setupSecret } from "@/lib/two-step-setup";
import { SetupForm } from "../forms";

export const metadata = { title: "Set up two-step sign-in" };

/** Signing in, at a company that requires two-step: set it up before going in. */
export default async function TwoStepSetupPage() {
  const pending = await readTwoStep();
  if (!pending || pending.step !== "setup") redirect("/login");
  const s = await setupSecret(pending.userId);
  if (!s) redirect("/login/two-step");
  return (
    <AuthCard
      title="Set up two-step sign-in"
      intro="Your company asks everyone on the team to use a code from their phone when signing in. It takes a minute."
      footer={
        <Link href="/logout" className="font-medium text-blue-700 hover:underline">
          Cancel
        </Link>
      }
    >
      <SetupForm qr={s.qr} secret={s.secret} />
    </AuthCard>
  );
}
