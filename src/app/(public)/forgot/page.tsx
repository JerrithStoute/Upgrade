import Link from "@/components/link";
import { AuthCard } from "@/components/auth-card";
import { ForgotForm } from "../forms";
import { robotCheckKey } from "@/lib/turnstile";
import { brandBySlug } from "@/lib/customer-brand";
import { appIdentityForSlug, customerPageMetadata } from "@/lib/app-identity";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const { b } = await searchParams;
  return customerPageMetadata(await appIdentityForSlug(b), "Forgot password", (await brandBySlug(b))?.logoUrl);
}

/** ?b=<builder>: from a builder's own sign-in page — its logo, and back to its page. */
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const brand = await brandBySlug((await searchParams).b);
  return (
    <AuthCard
      brand={brand}
      title="Forgot your password?"
      intro="Put in your email and we'll send a link to choose a new one."
      footer={
        <Link href={brand ? `/login/${brand.slug}` : "/login"} className="font-medium text-blue-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotForm robotKey={robotCheckKey()} />
    </AuthCard>
  );
}
