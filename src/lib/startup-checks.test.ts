import { test } from "node:test";
import assert from "node:assert/strict";
import { productionProblems } from "./startup-checks";

const good = {
  DATABASE_URL: "postgresql://app_user:x@db/bs",
  SYSTEM_DATABASE_URL: "postgresql://owner:y@db/bs",
  SESSION_SECRET: "s".repeat(48),
  ENCRYPTION_KEY: "e".repeat(48),
  APP_URL: "https://thebuilderstation.com",
  MAIL: "resend",
  RESEND_API_KEY: "re_123",
  STORAGE: "cloud",
  S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  S3_BUCKET: "files",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  TURNSTILE_SITE_KEY: "0x4AAA",
  TURNSTILE_SECRET_KEY: "0x4AAB",
};

test("a complete online setup starts", () => assert.deepEqual(productionProblems(good), []));

test("missing or unsafe settings stop it, each named", () => {
  const p = productionProblems({ ...good, ENCRYPTION_KEY: good.SESSION_SECRET, APP_URL: "http://x.com", SYSTEM_DATABASE_URL: good.DATABASE_URL, RESEND_API_KEY: undefined });
  assert.equal(p.length, 4);
  assert.ok(p.some((x) => x.includes("ENCRYPTION_KEY must be different")));
  assert.ok(p.some((x) => x.includes("https://")));
  assert.ok(p.some((x) => x.includes("limited login")));
  assert.ok(p.some((x) => x.includes("RESEND_API_KEY")));
});

test("files on the server's own disk are refused online", () => {
  assert.ok(productionProblems({ ...good, STORAGE: "local" }).some((x) => x.includes("STORAGE must be cloud")));
  assert.ok(productionProblems({ ...good, S3_BUCKET: undefined }).some((x) => x.includes("S3_BUCKET")));
});
