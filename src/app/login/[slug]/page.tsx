import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { brandBySlug } from "@/lib/customer-brand";
import { appIdentityForSlug, customerPageMetadata } from "@/lib/app-identity";
import { robotCheckKey } from "@/lib/turnstile";
import { LoginForm } from "../login-form";

/**
 * A builder's own sign-in page for its clients and subs (app.thebuilderstation.com/login/jti): its
 * logo, name and colors — nothing of The Builder Station. Every invitation and email to them points
 * here, and signing out comes back here (src/lib/customer-brand.ts).
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [app, brand] = await Promise.all([appIdentityForSlug(slug), brandBySlug(slug)]);
  // Added to a home screen from here (before signing in): the builder's app, not The Builder Station's.
  return customerPageMetadata(app, "Sign in", brand?.logoUrl);
}

export default async function BuilderLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; paused?: string }> }) {
  const [{ slug }, { next, paused }] = await Promise.all([params, searchParams]);
  const brand = await brandBySlug(slug);
  // An address that isn't any builder's (changed since the link was sent): the general sign-in page.
  if (!brand) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return (
    <AuthCard brand={brand} title="Sign in" intro={`Sign in to ${brand.name}.`}>
      {paused ? <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This account is paused for now. Contact {brand.name}.</p> : null}
      <LoginForm next={next} robotKey={robotCheckKey()} forgotHref={`/forgot?b=${brand.slug}`} />
    </AuthCard>
  );
}
