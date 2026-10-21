import { BrandMark } from "@/components/brand-mark";
import { StationBlock } from "@/components/station-logo";
import { getBrand } from "@/lib/company-brand";
import { LoginForm } from "./login-form";
import { robotCheckKey } from "@/lib/turnstile";
import { PAUSED_MESSAGE } from "@/lib/builder-status";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; paused?: string }>;
}) {
  const { next, paused } = await searchParams;
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
          {paused ? <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{PAUSED_MESSAGE}</p> : null}
          <LoginForm next={next} robotKey={robotCheckKey()} />
        </div>
      </div>
    </main>
  );
}
