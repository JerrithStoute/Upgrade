import Link from "@/components/link";
import { ArrowLeft, KeyRound, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { setupSecret } from "@/lib/two-step-setup";
import { fmtDateTime } from "@/lib/utils";
import { SetupForm } from "../login/two-step/forms";
import { PasswordForm, TwoStepOnForms } from "./forms";
import { signOutAll } from "./actions";
import { isPlatformAdmin } from "@/lib/builder-invites";

export const metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ twostep?: string; setup?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [user, company] = await Promise.all([
    systemDb.user.findUniqueOrThrow({ where: { id: me.id }, select: { email: true, name: true, totpEnabledAt: true, backupCodes: true, passwordChangedAt: true, lastSignInAt: true } }),
    systemDb.company.findUnique({ where: { id: me.companyId }, select: { name: true, requireTwoStep: true } }),
  ]);
  const home = me.role === "CLIENT" ? "/portal" : me.role === "VENDOR" ? "/vendor" : "/dashboard";
  const team = me.role === "ADMIN" || me.role === "STAFF";
  const backupLeft = user.backupCodes ? (JSON.parse(user.backupCodes) as string[]).length : 0;
  const setup = !user.totpEnabledAt && sp.setup === "1" ? await setupSecret(me.id) : null;
  const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Your account</h1>
          <p className="text-sm text-slate-500">
            {user.name} · {user.email} · {company?.name}
          </p>
        </div>
        {sp.twostep === "on" ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Two-step sign-in is on.</p> : null}
        {isPlatformAdmin(user.email) ? (
          <section className={card}>
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
              <UserPlus className="h-4 w-4 text-slate-400" /> The Builder Station
            </h2>
            <p className="mb-3 text-sm text-slate-500">You run it: sign-up is by invitation for now.</p>
            <Link href="/builders" className="text-sm font-medium text-blue-700 hover:underline">
              Invite a builder →
            </Link>
          </section>
        ) : null}

        <section className={card}>
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <KeyRound className="h-4 w-4 text-slate-400" /> Password
          </h2>
          <p className="mb-4 text-sm text-slate-500">{user.passwordChangedAt ? `Last changed ${fmtDateTime(user.passwordChangedAt)}.` : "Changing it signs out your other devices."}</p>
          <PasswordForm />
        </section>

        <section className={card}>
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-slate-400" /> Two-step sign-in
          </h2>
          {user.totpEnabledAt ? (
            <>
              <p className="mb-4 text-sm text-slate-500">
                <span className="font-medium text-emerald-700">On</span> since {fmtDateTime(user.totpEnabledAt)} — signing in asks for a code from your authenticator app. {backupLeft} backup
                code{backupLeft === 1 ? "" : "s"} left.
              </p>
              <TwoStepOnForms canTurnOff={!(company?.requireTwoStep && team)} />
            </>
          ) : setup ? (
            <div className="max-w-sm">
              <SetupForm qr={setup.qr} secret={setup.secret} />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-500">
                Off. With it on, signing in also asks for a 6-digit code from an app on your phone — so a stolen password alone can&apos;t get in.
              </p>
              <Link href="/account?setup=1" className="inline-block rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800">
                Set up two-step sign-in
              </Link>
            </>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <LogOut className="h-4 w-4 text-slate-400" /> Sign out everywhere
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Signs you out on every phone and computer, including this one — for a lost phone or a shared computer.{" "}
            {user.lastSignInAt ? `Last sign-in ${fmtDateTime(user.lastSignInAt)}.` : ""}
          </p>
          <form action={signOutAll}>
            <button type="submit" className="rounded-md border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
              Sign out everywhere
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
