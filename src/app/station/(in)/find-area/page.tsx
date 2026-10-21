import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { ENOUGH_TO_SCORE, scoreByVersion, scoresWorse, type VersionScore } from "@/lib/find-area-score";
import { ROOM_DETECT_VERSION } from "@/lib/room-detect";
import { Card, CardHeader, PageHeader, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Find area score" };

const REASONS: Record<string, string> = {
  open: "Ran out to the outside",
  "in-wall": "Clicked on a wall",
  "too-small": "Nothing there",
  unreadable: "Plan can't be read",
  "no-scale": "No scale",
};

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const added = (s: VersionScore) => s.kept + s.split + s.changed + s.removed;

/**
 * The Station's page: how Find area is doing, from what every builder did with its rooms — kept,
 * split, changed or taken back (src/lib/find-area-score.ts). Counts only: no plans, jobs or companies shown.
 */
export default async function FindAreaScorePage() {
  await requireStation();
  // Every company's clicks (the system login), the last 6 months.
  const since = monthsAgo(6);
  const rows = await systemDb.areaFindLog.findMany({
    where: { createdAt: { gte: since } },
    select: { version: true, ok: true, reason: true, outline: true, measurementId: true, sheetId: true, conditionId: true, ms: true, createdAt: true, companyId: true },
  });
  const shapes = await systemDb.takeoffMeasurement.findMany({
    where: { sheetId: { in: [...new Set(rows.map((r) => r.sheetId))] }, createdAt: { gte: since } },
    select: { id: true, sheetId: true, conditionId: true, points: true, createdAt: true },
  });
  const versions = scoreByVersion(rows, shapes);
  const latest = versions[0];
  const prev = versions[1];
  const worse = latest && prev ? scoresWorse(latest, prev) : false;
  const companies = new Set(rows.map((r) => r.companyId)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find area score"
        description="How often Find area gets the room right, from what builders did with each room it found — nobody has to check a plan."
      />
      {latest ? (
        <>
          {worse ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
              <strong className="font-semibold">The newest version scores worse than the one before</strong> ({pct(latest.rightShare)} right vs {pct(prev!.rightShare)}). Look at what
              changed in it.
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Right"
              value={added(latest) >= ENOUGH_TO_SCORE ? pct(latest.rightShare) : "Too early"}
              hint={`Kept as found, or split — of ${added(latest)} rooms added${added(latest) < ENOUGH_TO_SCORE ? ` (scored from ${ENOUGH_TO_SCORE})` : ""}`}
              tone={latest.rightShare == null || added(latest) < ENOUGH_TO_SCORE ? "default" : latest.rightShare >= 0.85 ? "good" : latest.rightShare >= 0.7 ? "warn" : "bad"}
            />
            <Stat label="Found a room" value={pct(latest.foundShare)} hint={`Of ${latest.clicks} clicks`} />
            <Stat label="Slowest usual click" value={latest.p90Ms == null ? "—" : `${(latest.p90Ms / 1000).toFixed(1)} s`} hint="9 in 10 clicks took this long or less" />
            <Stat label="Builders using it" value={companies} hint="Last 6 months" />
          </div>
        </>
      ) : null}
      <Card>
        <CardHeader title="By version" description={`Each change to Find area's rules is a new version (running now: ${ROOM_DETECT_VERSION}). Newest first.`} />
        {versions.length ? (
          <Table className="rounded-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Version</Th>
                <Th>Used</Th>
                <Th right>Clicks</Th>
                <Th right>Kept</Th>
                <Th right>Split</Th>
                <Th right>Changed</Th>
                <Th right>Taken back</Th>
                <Th right>Right</Th>
                <Th>No room found</Th>
              </tr>
            </THead>
            <TBody>
              {versions.map((v) => (
                <Tr key={v.version}>
                  <Td className="font-medium text-slate-900">{v.version}</Td>
                  <Td className="whitespace-nowrap text-slate-500">
                    {fmtDateTime(v.firstUsed)} – {fmtDateTime(v.lastUsed)}
                  </Td>
                  <Td right>{v.clicks}</Td>
                  <Td right>{v.kept}</Td>
                  <Td right>{v.split}</Td>
                  <Td right>{v.changed}</Td>
                  <Td right>{v.removed}</Td>
                  <Td right className="font-medium">
                    {added(v) >= ENOUGH_TO_SCORE ? pct(v.rightShare) : <span className="text-slate-400">{pct(v.rightShare)}</span>}
                  </Td>
                  <Td className="text-slate-500">
                    {Object.entries(v.noRoom)
                      .sort((a, b) => b[1] - a[1])
                      .map(([r, n]) => `${REASONS[r] ?? r} ${n}`)
                      .join(" · ") || "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="px-5 py-5 text-sm text-slate-500">No Find area clicks yet.</p>
        )}
      </Card>
      <Card>
        <CardHeader title="How it's scored" />
        <ul className="space-y-1.5 px-5 py-4 text-sm text-slate-600">
          <li>
            <strong className="font-medium text-slate-800">Kept</strong> — the room is still on the plan as found: it was right.
          </li>
          <li>
            <strong className="font-medium text-slate-800">Split</strong> — cut into rooms with ✂ Split: right, but two rooms came as one.
          </li>
          <li>
            <strong className="font-medium text-slate-800">Changed</strong> — its corners were moved: it was off.
          </li>
          <li>
            <strong className="font-medium text-slate-800">Taken back</strong> — undone or deleted: it was wrong.
          </li>
          <li>
            <strong className="font-medium text-slate-800">Right</strong> = kept + split, of the rooms added. Grayed until a version has {ENOUGH_TO_SCORE} rooms; flagged red when a
            new version scores more than 5 points under the one before.
          </li>
        </ul>
      </Card>
    </div>
  );
}
