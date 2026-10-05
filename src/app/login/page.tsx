import { BrandMark } from "@/components/brand-mark";
import { getBrand } from "@/lib/company-brand";
import { LoginForm } from "./login-form";

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
          <BrandMark logoUrl={brand.logoUrl} size="lg" />
          {brand.logoUrl ? null : <span className="text-2xl font-semibold tracking-tight">Upgrade</span>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
          <p className="mb-5 text-sm text-slate-500">Construction project management for your team and clients.</p>
          <LoginForm next={next} />
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500">
          <p className="mb-1 font-medium text-slate-600">Demo accounts (password: <code>password</code>)</p>
          <p>Owner: <code>owner@upgradebuilders.com</code></p>
          <p>Project manager: <code>pm@upgradebuilders.com</code></p>
          <p>Client: <code>client@example.com</code></p>
        </div>
      </div>
    </main>
  );
}
