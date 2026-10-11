import Link from "@/components/link";

/** The plain card the sign-in-type pages share (sign up, forgot password, invitations…). */
export function AuthCard({ title, intro, children, footer }: { title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-6 block text-center text-2xl font-semibold tracking-tight text-slate-900">
          The Builder Station
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">{title}</h1>
          {intro ? <div className="mb-5 text-sm text-slate-500">{intro}</div> : <div className="mb-4" />}
          {children}
        </div>
        {footer ? <div className="mt-4 text-center text-sm text-slate-600">{footer}</div> : null}
      </div>
    </main>
  );
}

/** A form's message: what went wrong (red) or what happened (green). */
export function FormNote({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  if (ok) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>;
  return null;
}

export const authButton = "w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60";
