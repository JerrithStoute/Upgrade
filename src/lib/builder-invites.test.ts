import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { isPlatformAdmin, makeBuilderInvite, readBuilderInvite } from "./builder-invites";

const key = new TextEncoder().encode("k".repeat(48));
const otherKey = new TextEncoder().encode("x".repeat(48));

test("an invitation reads back for its email, and only with the right key", async () => {
  const t = await makeBuilderInvite({ email: " Sam@Builder.COM ", name: "Sam", companyName: "Sam Homes" }, key);
  assert.deepEqual(await readBuilderInvite(t, key), { email: "sam@builder.com", name: "Sam", companyName: "Sam Homes" });
  assert.equal(await readBuilderInvite(t, otherKey), null, "made up elsewhere");
  assert.equal(await readBuilderInvite(t.slice(0, -2) + "xx", key), null, "changed");
  assert.equal(await readBuilderInvite("", key), null);
  assert.equal(await readBuilderInvite(null, key), null);
});

test("an expired invitation, or some other signed thing, isn't an invitation", async () => {
  const old = await new SignJWT({ kind: "builder-invite", email: "a@b.com" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(0).setExpirationTime(1).sign(key);
  assert.equal(await readBuilderInvite(old, key), null);
  const session = await new SignJWT({ sub: "user1", v: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key);
  assert.equal(await readBuilderInvite(session, key), null, "a sign-in token can't be used as an invitation");
});

test("only the listed emails run the platform", () => {
  const env = { PLATFORM_ADMIN_EMAILS: "Owner@Example.com, second@example.com" } as unknown as NodeJS.ProcessEnv;
  assert.equal(isPlatformAdmin("owner@example.com", env), true);
  assert.equal(isPlatformAdmin("SECOND@example.com", env), true);
  assert.equal(isPlatformAdmin("someone@example.com", env), false);
  assert.equal(isPlatformAdmin("owner@example.com", {} as unknown as NodeJS.ProcessEnv), false, "nobody when it isn't set");
});
