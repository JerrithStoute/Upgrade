/** What's missing or unsafe in the online server's settings (empty = good to go). */
export function productionProblems(env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  const need = (k: string, why: string) => !env[k] && out.push(`${k} is not set (${why})`);
  need("DATABASE_URL", "the app's database login");
  need("SYSTEM_DATABASE_URL", "the database owner login, for sign-in, backups and changes");
  if (env.DATABASE_URL && env.DATABASE_URL === env.SYSTEM_DATABASE_URL) out.push("DATABASE_URL must be the app's own limited login, not the same as SYSTEM_DATABASE_URL");
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32) out.push("ENCRYPTION_KEY must be at least 32 random characters");
  if (env.ENCRYPTION_KEY && env.ENCRYPTION_KEY === env.SESSION_SECRET) out.push("ENCRYPTION_KEY must be different from SESSION_SECRET");
  if (!env.APP_URL?.startsWith("https://")) out.push("APP_URL must be the site's https:// address (links in emails use it)");
  const mail = (env.MAIL || "resend").toLowerCase();
  if (mail === "outbox") out.push("MAIL=outbox only saves emails to disk — use MAIL=resend online");
  if (mail === "resend" && !env.RESEND_API_KEY) out.push("RESEND_API_KEY is not set (emails can't be sent)");
  // The server's own disk is wiped on every deploy: files must live in cloud storage.
  if ((env.STORAGE || "local").toLowerCase() !== "cloud") out.push("STORAGE must be cloud online (the server's disk is wiped on each deploy)");
  else for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) need(k, "cloud file storage");
  need("TURNSTILE_SITE_KEY", "the robot check on sign-up and forgot-password");
  need("TURNSTILE_SECRET_KEY", "the robot check on sign-up and forgot-password");
  return out;
}
