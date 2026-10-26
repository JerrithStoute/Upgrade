import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import Link from "@/components/link";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { Card, CardBody, CardHeader, Collapsible, ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { costableItem, jobChoices, type QbEntry } from "@/lib/qb/match";
import { disconnectQuickBooks, linkCostCode, linkJob, matchAgain, newQuickBooksPassword, setUpQuickBooks } from "./actions";
import { LinkPicker, PasswordButton } from "./parts";
import { companyClock } from "@/lib/company-zone";
import { requireView } from "@/lib/auth";

export const metadata = { title: "QuickBooks" };

/** QuickBooks shows "Customer:Job" — written out for people. */
const qbName = (fullName: string) => fullName.split(":").join(" › ");

export default async function QuickBooksPage() {
  await requireView("quickbooks");
  const { dateTime } = await companyClock();
  const [conn, list, projects, codes, vendorCount] = await Promise.all([
    db.qbConnection.findFirst(),
    db.qbListItem.findMany({ orderBy: { fullName: "asc" } }),
    db.project.findMany({ where: { isTemplate: false }, select: { id: true, number: true, name: true, qbListId: true }, orderBy: { number: "desc" } }),
    db.costCode.findMany({ where: { active: true }, select: { id: true, code: true, name: true, qbListId: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.vendor.count({ where: { qbListId: { not: null } } }),
  ]);

  if (!conn)
    return (
      <Card>
        <CardHeader title="QuickBooks Desktop" description="Link The Builder Station to the QuickBooks company file you keep your books in." />
        <CardBody className="space-y-4 text-sm text-slate-700">
          <p>
            It connects through Intuit&apos;s free <b>QuickBooks Web Connector</b>, on the computer QuickBooks runs on. Every few minutes it reads your QuickBooks lists and links
            them here:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Vendors</b> — the ones in QuickBooks show up in your vendor list.
            </li>
            <li>
              <b>Jobs</b> — each job is linked to the QuickBooks Customer:Job of the same name.
            </li>
            <li>
              <b>Cost codes</b> — each is linked to the QuickBooks item named with its code.
            </li>
          </ul>
          <p>For now it only reads QuickBooks — nothing in your books is changed.</p>
          <form action={setUpQuickBooks}>
            <SubmitButton pendingText="Setting up…">Set up the connection</SubmitButton>
          </form>
        </CardBody>
      </Card>
    );

  const entries = (kind: string): QbEntry[] =>
    list.filter((r) => r.kind === kind).map((r) => ({ ...r, detail: r.detail ? (JSON.parse(r.detail) as Record<string, string>) : {} }));
  const choices = jobChoices(entries("CUSTOMER"));
  const items = entries("ITEM").filter(costableItem);
  const qbVendors = entries("VENDOR").filter((v) => v.active).length;
  const jobTaken = new Map(projects.filter((p) => p.qbListId).map((p) => [p.qbListId!, p.id]));
  const itemTaken = new Map(codes.filter((c) => c.qbListId).map((c) => [c.qbListId!, c.id]));
  const unlinkedJobs = projects.filter((p) => !p.qbListId || !choices.some((c) => c.listId === p.qbListId)).length;
  const unlinkedCodes = codes.filter((c) => !c.qbListId);
  const synced = !!conn.lastSyncAt;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="QuickBooks Desktop"
          description={
            synced ? (
              <span className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Connected to {conn.qbCompany ?? "QuickBooks"} · last update {dateTime(conn.lastSyncAt)}
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
          {conn.lastError ? (
            <p className="flex gap-2 rounded-md bg-rose-50 px-3 py-2 text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {conn.lastError}
            </p>
          ) : null}
          {synced ? (
            <p className="text-slate-600">
              The Web Connector updates every 15 minutes while it&apos;s running — or click <b>Update Selected</b> in it any time.
              {conn.companyFile ? <span className="mt-1 block text-xs text-slate-500">Company file: {conn.companyFile}</span> : null}
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

      {synced ? (
        <>
          <Card>
            <CardHeader
              title="Jobs"
              description={
                unlinkedJobs
                  ? `${unlinkedJobs} not linked yet. A job links when its name matches a QuickBooks Customer:Job exactly — or pick one.`
                  : "Every job is linked to its QuickBooks Customer:Job."
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
                        label={`QuickBooks Customer:Job for ${p.name}`}
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
            <CardHeader
              title="Cost codes"
              description={`${codes.length - unlinkedCodes.length} of ${codes.length} linked to the QuickBooks item named with their code.`}
            />
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
                <Link href="/settings/vendors" className={buttonClasses("secondary", "sm")}>
                  Vendor list
                </Link>
              }
            />
            <CardBody className="text-sm text-slate-600">
              Vendors come from QuickBooks: add one there and it shows up in your vendor list after the next update; rename one there and it&apos;s renamed here.
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
