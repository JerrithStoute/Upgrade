import "server-only";
import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { appUrl } from "@/lib/mail";
import { qwcFile } from "./qbxml";

/** The Builder Station's id as an app to QuickBooks (the .qwc file's OwnerID) — the same for every company. */
export const OWNER_ID = "{6F1D3B2A-8C4E-4A7F-B5D9-3E2C1A0F9B47}";

/** A password for the Web Connector: 4 groups of 4, nothing easily misread (no 0/O, 1/l/I). */
export function newPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => abc[b % abc.length])
    .join("")
    .replace(/(.{4})(?=.)/g, "$1-");
}

export const hashQbPassword = (password: string) => bcrypt.hash(password, 10);

export function newConnectionFields() {
  return { username: `tbs-${randomBytes(5).toString("hex")}`, fileId: `{${randomUUID().toUpperCase()}}` };
}

/** The file you give the Web Connector ("Add an application"). No password in it. */
export function connectionFile(c: { username: string; fileId: string }, companyName: string) {
  return qwcFile({
    // Each app in a Web Connector needs its own name — the company's keeps two companies apart.
    appName: `The Builder Station (${companyName.replace(/[<>"]/g, "").slice(0, 60)})`,
    url: appUrl("/api/qbwc"),
    supportUrl: appUrl("/api/qbwc"),
    username: c.username,
    ownerId: OWNER_ID,
    fileId: c.fileId,
  });
}
