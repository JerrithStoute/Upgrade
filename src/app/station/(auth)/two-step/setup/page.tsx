import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readStationStep, stationSetupSecret } from "@/lib/station-auth";
import { StationSetupForm } from "../../forms";

export const metadata = { title: "Set up two-step sign-in" };

/** Everyone at the Station uses a code from their phone: set up before going in. */
export default async function StationTwoStepSetupPage() {
  const step = await readStationStep();
  if (!step || step.step !== "setup") redirect("/station/login");
  const s = await stationSetupSecret(step.userId);
  if (!s) redirect("/station/login");
  return (
    <AuthCard
      home="/station/login"
      title="Set up two-step sign-in"
      intro="Everyone who runs The Builder Station signs in with a code from their phone too. It takes a minute."
      footer={
        <Link href="/station/login" className="font-medium text-blue-700 hover:underline">
          Cancel
        </Link>
      }
    >
      <StationSetupForm qr={s.qr} secret={s.secret} />
    </AuthCard>
  );
}
