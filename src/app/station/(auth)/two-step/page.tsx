import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readStationStep } from "@/lib/station-auth";
import { StationCodeForm } from "../forms";

export const metadata = { title: "Station sign-in" };

export default async function StationTwoStepPage() {
  const step = await readStationStep();
  if (!step) redirect("/station/login");
  if (step.step === "setup") redirect("/station/two-step/setup");
  return (
    <AuthCard
      home="/station/login"
      title="One more step"
      intro="Open your authenticator app and type the 6-digit code for The Builder Station · Station."
      footer={
        <Link href="/station/login" className="font-medium text-blue-700 hover:underline">
          Cancel
        </Link>
      }
    >
      <StationCodeForm />
    </AuthCard>
  );
}
