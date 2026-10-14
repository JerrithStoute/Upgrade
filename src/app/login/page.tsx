import { BrandMark } from "@/components/brand-mark";
import { StationBlock } from "@/components/station-logo";
import { getBrand } from "@/lib/company-brand";
import { LoginForm } from "./login-form";
import { robotCheckKey } from "@/lib/turnstile";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const brand = await getBrand();
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-slate-900">
          {brand.logoUrl ? (
            <BrandMark logoUrl={brand.logoUrl} size="lg" />
          ) : (
            <StationBlock />
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
          <p className="mb-5 text-sm text-slate-500">Construction project management for your team and clients.</p>
          <LoginForm next={next} robotKey={robotCheckKey()} />
        </div>
      </div>
    </main>
  );
}
