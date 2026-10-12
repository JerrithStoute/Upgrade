/** Terms and Privacy share this: a draft notice and plain, readable sections. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
        Draft — to be reviewed by an attorney before The Builder Station opens to the public.
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            {s.p.map((t) => (
              <p key={t} className="mt-2 text-slate-700">
                {t}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
