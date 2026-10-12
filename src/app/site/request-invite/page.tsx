import { robotCheckKey } from "@/lib/turnstile";
import { CheckList, SiteHeading } from "../parts";
import { RequestInviteForm } from "./request-form";

export const metadata = { title: "Request an invite" };

export default function RequestInvitePage() {
  return (
    <>
      <SiteHeading title="Request an invite" intro="We're opening The Builder Station to builders a few at a time. Tell us about your company and we'll send your invitation." />
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <RequestInviteForm robotKey={robotCheckKey()} />
        </div>
        <div>
          <h2 className="font-semibold">What happens next</h2>
          <CheckList
            className="mt-4 text-slate-700"
            items={[
              "We read every request ourselves",
              "Your invitation comes by email, with a sign-up link just for you",
              "Set up your company in a couple of minutes — common lumber sizes are already there",
              "Bring your whole team: unlimited users",
            ]}
          />
        </div>
      </section>
    </>
  );
}
