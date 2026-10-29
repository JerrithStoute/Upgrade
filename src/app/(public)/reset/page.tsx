import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { peekLink } from "@/lib/account";
import { ResetForm } from "../forms";
import { brandForPerson } from "@/lib/customer-brand";
import { appIdentityForCompany, customerPageMetadata } from "@/lib/app-identity";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const user = await peekLink((await searchParams).token ?? "", "RESET_PASSWORD");
  const [app, brand] = user ? await Promise.all([appIdentityForCompany(user.companyId, user.role), brandForPerson(user)]) : [null, null];
  return customerPageMetadata(app, "Choose a new password", brand?.logoUrl);
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const user = await peekLink(token, "RESET_PASSWORD");
  const brand = await brandForPerson(user);
  if (!user)
    return (
      <AuthCard title="That link doesn't work any more" intro="Reset links work once, for 1 hour.">
        <Link href="/forgot" className="font-medium text-blue-700 hover:underline">
          Send a new link
        </Link>
      </AuthCard>
    );
  return (
    <AuthCard brand={brand} title="Choose a new password" intro={<>For {user.email}. Any other sign-ins will be signed out.</>}>
      <ResetForm token={token} />
    </AuthCard>
  );
}
