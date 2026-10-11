import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashCode, newBackupCodes, newSecret, totp, verifyTotp } from "./totp";
import { passwordProblem } from "./passwords";

// RFC 6238 test secret ("12345678901234567890"), SHA-1, 6 digits.
const RFC = base32Encode(Buffer.from("12345678901234567890"));

test("codes match the standard's published examples", () => {
  assert.equal(totp(RFC, 59_000), "287082");
  assert.equal(totp(RFC, 1111111109_000), "081804");
  assert.equal(totp(RFC, 1234567890_000), "005924");
  assert.equal(totp(RFC, 2000000000_000), "279037");
});

test("base32 round-trips", () => {
  const b = Buffer.from([1, 2, 3, 250, 0, 7]);
  assert.deepEqual(base32Decode(base32Encode(b)), b);
  assert.equal(newSecret().length, 32);
});

test("a code is good for its 30 seconds and one step either side", () => {
  const s = newSecret();
  const now = 1_790_000_000_000;
  const code = totp(s, now);
  assert.equal(verifyTotp(s, code, now), true);
  assert.equal(verifyTotp(s, code, now + 30_000), true);
  assert.equal(verifyTotp(s, code, now + 95_000), false);
  assert.equal(verifyTotp(s, "12345", now), false);
  assert.equal(verifyTotp(s, ` ${code.slice(0, 3)} ${code.slice(3)} `, now), true);
});

test("backup codes are one-off and stored as hashes", () => {
  const { codes, hashes } = newBackupCodes();
  assert.equal(codes.length, 10);
  assert.match(codes[0], /^[a-z2-7]{4}-[a-z2-7]{4}$/);
  assert.equal(hashCode(codes[3].toUpperCase().replace("-", " ")), hashes[3]);
});

test("the secret is encrypted and only the key opens it", () => {
  const sealed = encryptSecret("JBSWY3DPEHPK3PXP", "k".repeat(40));
  assert.notEqual(sealed.includes("JBSWY3DP"), true);
  assert.equal(decryptSecret(sealed, "k".repeat(40)), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decryptSecret(sealed, "x".repeat(40)));
});

test("password rules, in plain words", () => {
  assert.match(passwordProblem("short") ?? "", /10 characters/);
  assert.equal(passwordProblem("my dog likes the park"), null);
  assert.match(passwordProblem("jordanbuilds123", "jordan@x.com") ?? "", /email/);
  assert.match(passwordProblem("aaaaaaaaaaaa") ?? "", /easy/);
});
