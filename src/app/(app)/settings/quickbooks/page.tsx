import { AlertTriangle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import Link from "@/components/link";
import { db } from "@/lib/db";
import { money } from "@/lib/utils";
import { Card, CardBody, CardHeader, Collapsible, ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { costableItem, jobChoices, type QbEntry } from "@/lib/qb/match";
import { qboConfigured, qboSandbox } from "@/lib/qbo/client";
import { billsWaiting } from "@/lib/qbo/sync";
import {
  disconnectQuickBooks,
  disconnectQuickBooksOnline,
  linkCostCode,
  linkCustomerToJob,
  linkJob,
  matchAgain,
  newQuickBooksPassword,
  setInvoiceItem,
  setUpQuickBooks,
  updateFromQuickBooksOnline,
} from "./actions";
import { LinkPicker, PasswordButton, UpdateButton } from "./parts";
import { companyClock } from "@/lib/company-zone";
import { requireView } from "@/lib/auth";

export const metadata = { title: "QuickBooks" };

/** QuickBooks shows "Customer:Job" — written out for people. */
const qbName = (fullName: string) => fullName.split(":").join(" › ");

/** What came back from Intuit's sign-in (/api/qbo/connect and /callback). */
const BACK: Record<string, { good?: boolean; text: string }> = {
  connected: { good: true, text: "QuickBooks Online is connected. The first update is running — it can take a minute; refresh to see what it found." },
  denied: { text: "QuickBooks wasn't connected — Intuit's page was closed or the connection wasn't allowed." },
  expired: { text: "That took too long or came back from somewhere else. Click Connect QuickBooks Online and try again." },
  failed: { text: "Intuit didn't finish the connection. Try again in a minute." },
  desktop: { text: "This company is connected to QuickBooks Desktop. Disconnect it first to use QuickBooks Online instead." },
  "other-builder": { text: "That QuickBooks company is already connected to another builder on The Builder Station." },
  switch: { text: "This is connected to a different QuickBooks company. Disconnect first, then connect the other one." },
  "not-set-up": { text: "QuickBooks Online isn't turned on for The Builder Station yet." },
  "not-allowed": { text: "Your position can't change the QuickBooks connection — an admin can allow it in Directory → Team." },
};

export default async function QuickBooksPage({ searchParams }: { searchParams: Promise<{ qbo?: string }> }) {
  await requireView("quickbooks");
  const { qbo: came } = await searchParams;
  const { dateTime } = await companyClock();
  const [conn, online, list, projects, codes, vendorCount] = await Promise.all([
    db.qbConnection.findFirst(),
    db.qboConnection.findFirst(),
    db.qbListItem.findMany({ orderBy: { fullName: "asc" } }),
    db.project.findMany({ where: { isTemplate: false }, select: { id: true, number: true, name: true, qbListId: true }, orderBy: { number: "desc" } }),
    db.costCode.findMany({ where: { active: true }, select: { id: true, code: true, name: true, qbListId: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.vendor.count({ where: { qbListId: { not: null } } }),
  ]);
  const notice = came && BACK[came] ? BACK[came] : null;
  const noticeBox = notice ? (
    <p className={`flex gap-2 rounded-md px-3 py-2 text-sm ${notice.good ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {notice.good ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />} {notice.text}
    </p>
  ) : null;

  const entries = (kind: string): QbEntry[] =>
    list.filter((r) => r.kind === kind).map((r) => ({ ...r, detail: r.detail ? (JSON.parse(r.detail) as Record<string, string>) : {} }));
  const linking = { entries, projects, codes, vendorCount };

  // --- Not connected: Online or Desktop. ---------------------------------------------------------------
  if (!conn && !online)
    return (
      <div className="space-y-6">
        {noticeBox}
        <Card>
          <CardHeader title="QuickBooks Online" description="For books kept in QuickBooks Online (in your web browser)." />
          <CardBody className="space-y-4 text-sm text-slate-700">
            <p>Sign in to Intuit and allow The Builder Station. Then, every 15 minutes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>Vendors, jobs and cost codes</b> link up by name — vendors in QuickBooks show up in your vendor list; each job links to the QuickBooks customer or job of
                the same name; each cost code to the item named with its code.
              </li>
              <li>
                <b>Bills</b> entered in QuickBooks come in on their jobs — approved, their lines the job&apos;s actual cost. Paid there, paid here.
              </li>
              <li>
                <b>Invoices</b> go to QuickBooks when you send them, and <b>payments</b> received in QuickBooks show up on them.
              </li>
            </ul>
            {qboConfigured() ? (
              <a href="/api/qbo/connect" className={buttonClasses("primary", "md")}>
                Connect QuickBooks Online <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="text-slate-500">Coming soon.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="QuickBooks Desktop" description="For books kept in QuickBooks Desktop, on a computer or server of your own." />
          <CardBody className="space-y-4 text-sm text-slate-700">
            <p>
              It connects through Intuit&apos;s free <b>QuickBooks Web Connector</b>, on the computer QuickBooks runs on. Every few minutes it reads your QuickBooks lists and
              links your vendors, jobs and cost codes the same way. For now it only reads QuickBooks — nothing in your books is changed.
            </p>
            <form action={setUpQuickBooks}>
              <SubmitButton variant="secondary" pendingText="Setting up…">
                Set up QuickBooks Desktop
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    );

  // --- QuickBooks Online. -----------------------------------------------------------------------------
  if (online) {
    const synced = !!online.lastSyncAt;
    const waiting = synced ? await billsWaiting() : [];
    const items = entries("ITEM").filter((i) => i.active && costableItem(i));
    const openJobs = projects.filter((p) => !p.qbListId);
    return (
      <div className="space-y-6">
        {noticeBox}
        <Card>
          <CardHeader
            title="QuickBooks Online"
            description={
              synced ? (
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Connected to {online.qbCompany ?? "QuickBooks"} · last update {dateTime(online.lastSyncAt)}
                </span>
              ) : (
                `Connected to ${online.qbCompany ?? "QuickBooks"} — the first update is on its way.`
              )
            }
          />
          <CardBody className="space-y-4 text-sm text-slate-700">
            {qboSandbox() ? <p className="text-xs font-medium text-amber-700">Intuit test company (sandbox) — not real books.</p> : null}
            {online.lastError ? (
              <p className="flex gap-2 rounded-md bg-rose-50 px-3 py-2 text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {online.lastError}
              </p>
            ) : null}
            <p className="text-slate-600">
              It updates on its own every 15 minutes.{online.lastSummary ? ` Last update: ${online.lastSummary.toLowerCase()}.` : ""}
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <UpdateButton action={updateFromQuickBooksOnline} />
              {online.lastError?.includes("connected again") ? (
                <a href="/api/qbo/connect" className={buttonClasses("primary", "md")}>
                  Connect QuickBooks Online <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {synced ? (
                <form action={matchAgain}>
                  <SubmitButton variant="secondary" pendingText="Linking…">
                    Link by name again
                  </SubmitButton>
                </form>
              ) : null}
              <ConfirmForm
                action={disconnectQuickBooksOnline}
                message="Disconnect QuickBooks Online? Nothing here stays linked to QuickBooks, and updates stop. Bills and payments already brought in stay. Your QuickBooks books aren't touched."
                className="ml-auto"
              >
                Disconnect
              </ConfirmForm>
            </div>
          </CardBody>
        </Card>

        {synced ? (
          <Card>
            <CardHeader
              title="Invoices"
              description={
                online.invoiceItemId
                  ? "Invoices go to QuickBooks when you send them, every line on this item. Payments received in QuickBooks come back to them."
                  : "Pick the QuickBooks item invoice lines go on — invoices can't go to QuickBooks until you do."
              }
            />
            <CardBody>
              <div className="w-full sm:w-96">
                <LinkPicker
                  action={setInvoiceItem}
                  hidden={{}}
                  value={online.invoiceItemId ?? ""}
                  label="QuickBooks item for invoice lines"
                  empty="— Pick an item —"
                  options={items.map((i) => ({ value: i.listId, label: [qbName(i.fullName), i.detail.description].filter(Boolean).join(" — ") }))}
                />
              </div>
            </CardBody>
          </Card>
        ) : null}

        {waiting.length ? (
          <Card>
            <CardHeader
              title="Bills waiting for a job"
              description="Bills in QuickBooks on customers that aren't linked to a job here. Pick the job and they come in on it."
            />
            <ul className="divide-y divide-slate-100 text-sm">
              {waiting.map((w) => (
                <li key={w.customerId} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{qbName(entries("CUSTOMER").find((c) => c.listId === w.customerId)?.fullName ?? w.customerName)}</span>
                    <span className="text-xs text-slate-500">
                      {w.bills} bill{w.bills === 1 ? "" : "s"} · {money(w.amount)}
                    </span>
                  </span>
                  <div className="w-full sm:w-96">
                    {openJobs.length === 0 ? (
                      <p className="text-xs text-slate-500">Every job here is linked already — add the job first, or change a link under Jobs.</p>
                    ) : (
                    <LinkPicker
                      action={linkCustomerToJob}
                      hidden={{ customerId: w.customerId }}
                      value=""
                      label={`Job for ${w.customerName}`}
                      empty="— Pick the job —"
                      options={openJobs.map((p) => ({ value: p.id, label: `#${p.number} ${p.name}` }))}
                    />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {synced ? <LinkCards {...linking} /> : null}
      </div>
    );
  }

  // --- QuickBooks Desktop. ----------------------------------------------------------------------------
  const desktop = conn!;
  const synced = !!desktop.lastSyncAt;
  return (
    <div className="space-y-6">
      {noticeBox}
      <Card>
        <CardHeader
          title="QuickBooks Desktop"
          description={
            synced ? (
              <span className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Connected to {desktop.qbCompany ?? "QuickBooks"} · last update {dateTime(desktop.lastSyncAt)}
              </span>
            ) : (
              "Waiting for the Web Connector — follow the steps below."
            )
          }
          actions={
            <a href="/settings/quickbooks/connection-file" className={buttonClasses("secondary", "sm")}>
              <Download className="h-3.5 w-3.5" /> Connection file
            </a>
          }
        />
        <CardBody className="space-y-4 text-sm text-slate-700">
          {desktop.lastError ? (
            <p className="flex gap-2 rounded-md bg-rose-50 px-3 py-2 text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {desktop.lastError}
            </p>
          ) : null}
          {synced ? (
            <p className="text-slate-600">
              The Web Connector updates every 15 minutes while it&apos;s running — or click <b>Update Selected</b> in it any time.
              {desktop.companyFile ? <span className="mt-1 block text-xs text-slate-500">Company file: {desktop.companyFile}</span> : null}
            </p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Download the <b>connection file</b> (button above) and put it where you can get to it from the computer QuickBooks runs on.
              </li>
              <li>
                On that computer, open QuickBooks with the company you want to connect, signed in as <b>Admin</b>, with no one else in it. Check the name at the top of QuickBooks
                — it&apos;s the company this gets tied to.
              </li>
              <li>
                In QuickBooks choose <b>File → Update Web Services</b> (that opens the Web Connector). Click <b>Add an application</b> and pick the file. When QuickBooks asks,
                choose <b>“Yes, always; allow access even if QuickBooks is not running”</b>, then <b>Continue</b> and <b>Done</b>.
              </li>
              <li>
                In the Web Connector, find <b>The Builder Station</b> and paste the password into its <b>Password</b> box (make it with the button below). Say <b>Yes</b> to
                saving it.
              </li>
              <li>
                Tick its box and click <b>Update Selected</b>. Then come back here — this page shows what it found.
              </li>
            </ol>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <PasswordButton action={newQuickBooksPassword} variant={synced ? "secondary" : "primary"}>
              {synced ? "New password" : "Make the password"}
            </PasswordButton>
            {synced ? (
              <form action={matchAgain}>
                <SubmitButton variant="secondary" pendingText="Linking…">
                  Link by name again
                </SubmitButton>
              </form>
            ) : null}
            <ConfirmForm
              action={disconnectQuickBooks}
              message="Disconnect QuickBooks? The Web Connector won't be able to sign in, and nothing here stays linked to QuickBooks. Your QuickBooks file isn't touched."
              className="ml-auto"
            >
              Disconnect
            </ConfirmForm>
          </div>
        </CardBody>
      </Card>
      {synced ? <LinkCards {...linking} /> : null}
    </div>
  );
}

/** Jobs, cost codes and vendors, linked to QuickBooks — the same for Online and Desktop. */
function LinkCards({
  entries,
  projects,
  codes,
  vendorCount,
}: {
  entries: (kind: string) => QbEntry[];
  projects: { id: string; number: number; name: string; qbListId: string | null }[];
  codes: { id: string; code: string | null; name: string; qbListId: string | null }[];
  vendorCount: number;
}) {
  const choices = jobChoices(entries("CUSTOMER"));
  const items = entries("ITEM").filter(costableItem);
  const qbVendors = entries("VENDOR").filter((v) => v.active).length;
  const jobTaken = new Map(projects.filter((p) => p.qbListId).map((p) => [p.qbListId!, p.id]));
  const itemTaken = new Map(codes.filter((c) => c.qbListId).map((c) => [c.qbListId!, c.id]));
  const unlinkedJobs = projects.filter((p) => !p.qbListId || !choices.some((c) => c.listId === p.qbListId)).length;
  const unlinkedCodes = codes.filter((c) => !c.qbListId);
  return (
    <>
      <Card>
        <CardHeader
          title="Jobs"
          description={
            unlinkedJobs
              ? `${unlinkedJobs} not linked yet. A job links when its name matches a QuickBooks customer or job exactly — or pick one.`
              : "Every job is linked to its QuickBooks customer or job."
          }
        />
        <ul className="divide-y divide-slate-100 text-sm">
          {projects.map((p) => {
            const linked = p.qbListId && choices.some((c) => c.listId === p.qbListId);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:underline">
                  #{p.number} {p.name}
                </Link>
                {linked ? null : <span className="text-xs font-medium text-amber-700">{p.qbListId ? "Not in QuickBooks any more" : "Not linked yet"}</span>}
                <div className="w-full sm:w-96">
                  <LinkPicker
                    action={linkJob}
                    hidden={{ projectId: p.id }}
                    value={linked ? p.qbListId! : ""}
                    label={`QuickBooks customer or job for ${p.name}`}
                    empty="— Not linked —"
                    options={choices
                      .filter((c) => !jobTaken.has(c.listId) || jobTaken.get(c.listId) === p.id)
                      .map((c) => ({ value: c.listId, label: qbName(c.fullName) + (c.active ? "" : " (inactive)") }))}
                  />
                </div>
              </li>
            );
          })}
          {projects.length === 0 ? <li className="px-5 py-3 text-slate-500">No jobs yet.</li> : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Cost codes" description={`${codes.length - unlinkedCodes.length} of ${codes.length} linked to the QuickBooks item named with their code.`} />
        {unlinkedCodes.length ? (
          <CardBody>
            <Collapsible summary={`${unlinkedCodes.length} not linked — pick their items`} defaultOpen={unlinkedCodes.length <= 10}>
              <ul className="divide-y divide-slate-100 text-sm">
                {unlinkedCodes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{[c.code, c.name].filter(Boolean).join(" ")}</span>
                    <div className="w-full sm:w-96">
                      <LinkPicker
                        action={linkCostCode}
                        hidden={{ costCodeId: c.id }}
                        value=""
                        label={`QuickBooks item for ${c.name}`}
                        empty="— Not linked —"
                        options={items.filter((i) => !itemTaken.has(i.listId)).map((i) => ({ value: i.listId, label: [qbName(i.fullName), i.detail.description].filter(Boolean).join(" — ") }))}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Collapsible>
          </CardBody>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Vendors"
          description={`${vendorCount} of your vendors are linked to QuickBooks (${qbVendors} active there).`}
          actions={
            <Link href="/vendors" className={buttonClasses("secondary", "sm")}>
              Vendor list
            </Link>
          }
        />
        <CardBody className="text-sm text-slate-600">
          Vendors come from QuickBooks: add one there and it shows up in your vendor list after the next update; rename one there and it&apos;s renamed here.
        </CardBody>
      </Card>
    </>
  );
}
