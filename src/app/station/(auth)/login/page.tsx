import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getStationUser } from "@/lib/station-auth";
import { robotCheckKey } from "@/lib/turnstile";
import { StationLoginForm } from "../forms";

export const metadata = { title: "Station sign-in" };

/** The Builder Station's own sign-in — for the people who run it, not builders. */
export default async function StationLoginPage() {
  if (await getStationUser()) redirect("/station");
  return (
    <AuthCard home="/station/login" title="The Builder Station · Station" intro="For the people who run The Builder Station. Builders sign in at the regular sign-in page.">
      <StationLoginForm robotKey={robotCheckKey()} />
    </AuthCard>
  );
}
