import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { makeBidLink, readBidLink } from "./bid-link";
import { getSessionKey } from "./session-secret";

test("a vendor's price link opens its one bid — and nothing made up or signed some other way", async () => {
  const link = await makeBidLink("bid1", "co1");
  assert.deepEqual(await readBidLink(link), { bidId: "bid1", companyId: "co1" });
  assert.equal(await readBidLink(`${link.slice(0, -2)}xx`), null, "changed");
  assert.equal(await readBidLink("nonsense"), null);
  // A sign-in cookie (the session key) can't pass for a price link, even shaped like one.
  const forged = await new SignJWT({ kind: "bid-prices", c: "co1" }).setProtectedHeader({ alg: "HS256" }).setSubject("bid1").setExpirationTime("1h").sign(getSessionKey());
  assert.equal(await readBidLink(forged), null);
});
