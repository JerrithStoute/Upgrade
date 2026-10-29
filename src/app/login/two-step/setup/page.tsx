import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readTwoStep } from "@/lib/two-step";
import { setupSecret } from "@/lib/two-step-setup";
import { systemDb } from "@/lib/db";
import { brandForPerson } from "@/lib/customer-brand";
import { appIdentityForCompany, customerPageMetadata } from "@/lib/app-identity";
import { SetupForm } from "../forms";

export async function generateMetadata() {
  const pending = await readTwoStep();
  const user = pending ? await systemDb.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } }) : null;
  const [app, brand] = user ? await Promise.all([appIdentityForCompany(user.companyId, user.role), brandForPerson(user)]) : [null, null];
  return customerPageMetadata(app, "Set up two-step sign-in", brand?.logoUrl);
}

/** Signing in, at a company that requires two-step: set it up before going in. */
export default async function TwoStepSetupPage() {
  const pending = await readTwoStep();
  if (!pending || pending.step !== "setup") redirect("/login");
  const s = await setupSecret(pending.userId);
  if (!s) redirect("/login/two-step");
  const brand = await brandForPerson(await systemDb.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } }));
  return (
    <AuthCard
      brand={brand}
      title="Set up two-step sign-in"
      intro={
        brand
          ? `${brand.name} asks for a code from your phone when signing in. It takes a minute.`
          : "Your company asks everyone on the team to use a code from their phone when signing in. It takes a minute."
      }
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
