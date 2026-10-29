import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { readTwoStep } from "@/lib/two-step";
import { systemDb } from "@/lib/db";
import { brandForPerson } from "@/lib/customer-brand";
import { appIdentityForCompany, customerPageMetadata } from "@/lib/app-identity";
import { CodeForm } from "./forms";

export async function generateMetadata() {
  const pending = await readTwoStep();
  const user = pending ? await systemDb.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } }) : null;
  const [app, brand] = user ? await Promise.all([appIdentityForCompany(user.companyId, user.role), brandForPerson(user)]) : [null, null];
  return customerPageMetadata(app, "Two-step sign-in", brand?.logoUrl);
}

export default async function TwoStepPage() {
  const pending = await readTwoStep();
  if (!pending) redirect("/login");
  if (pending.step === "setup") redirect("/login/two-step/setup");
  const brand = await brandForPerson(await systemDb.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } }));
  return (
    <AuthCard
      brand={brand}
      title="One more step"
      intro={`Open your authenticator app and type the 6-digit code for ${brand?.name ?? "The Builder Station"}.`}
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
