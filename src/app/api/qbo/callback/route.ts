import { cookies } from "next/headers";
import { requireEdit } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { QboError, exchangeCode, qboApi, revoke, sealTokens } from "@/lib/qbo/client";
import { syncQboNow } from "@/lib/qbo/sync";

/** Back from Intuit: allowed (a code and the QuickBooks company) or not. */
export async function GET(req: Request) {
  let me;
  try {
    me = await requireEdit("quickbooks");
  } catch {
    return back("not-allowed");
  }
  const q = new URL(req.url).searchParams;
  const store = await cookies();
  const expected = store.get("qbo_state")?.value;
  store.set("qbo_state", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/qbo", maxAge: 0 });
  if (q.get("error")) return back("denied");
  const code = q.get("code");
  const realmId = q.get("realmId");
  if (!expected || q.get("state") !== expected || !code || !realmId) return back("expired");
  if (await db.qbConnection.findFirst({ select: { id: true } })) return back("desktop");

  let tokens;
  try {
    tokens = sealTokens(await exchangeCode(code));
  } catch (e) {
    if (!(e instanceof QboError)) console.error("[quickbooks online] connect failed:", e);
    return back("failed");
  }
  // One QuickBooks company, one builder.
  const taken = await systemDb.qboConnection.findUnique({ where: { realmId }, select: { companyId: true } });
  if (taken && taken.companyId !== me.companyId) {
    await revoke(tokens.refreshToken);
    return back("other-builder");
  }
  const mine = await db.qboConnection.findFirst();
  if (mine && mine.realmId !== realmId) {
    await revoke(tokens.refreshToken);
    return back("switch");
  }
  const conn = mine
    ? await db.qboConnection.update({ where: { id: mine.id }, data: { ...tokens, lastError: null } })
    : await db.qboConnection.create({ data: { realmId, ...tokens, connectedById: me.id } });

  try {
    const info = await qboApi(conn).call<{ CompanyInfo?: { CompanyName?: string } }>(`companyinfo/${encodeURIComponent(realmId)}`);
    if (info.CompanyInfo?.CompanyName) await db.qboConnection.update({ where: { id: conn.id }, data: { qbCompany: info.CompanyInfo.CompanyName } });
  } catch {}
  if (!mine) await logActivity({ userId: me.id, type: "quickbooks.connected", description: `${me.name} connected QuickBooks Online` });
  // The first update runs on its own; the page shows it when it's done.
  void runAsCompany(me.companyId, () => syncQboNow()).catch((err) => console.error("[quickbooks online] first update failed:", err));
  return back("connected");
}

const back = (why: string) => new Response(null, { status: 303, headers: { Location: `/settings/quickbooks?qbo=${why}` } });
