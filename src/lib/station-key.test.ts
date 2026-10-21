import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, jwtVerify } from "jose";
import { getSessionKey } from "./session-secret";
import { getStationKey, STATION_COOKIE } from "./station-key";

const signed = (key: Uint8Array, claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key);
const passes = (token: string, key: Uint8Array) =>
  jwtVerify(token, key).then(
    () => true,
    () => false,
  );

test("a builder's sign-in never passes for a Station one, or the other way around", async () => {
  const builder = await signed(getSessionKey(), { sub: "u1", v: 0 });
  const station = await signed(getStationKey(), { sub: "s1", v: 0, kind: "station" });
  assert.equal(await passes(builder, getStationKey()), false, "builder cookie at the Station");
  assert.equal(await passes(station, getSessionKey()), false, "Station cookie in the builders' program");
  assert.equal(await passes(station, getStationKey()), true);
  assert.notEqual(STATION_COOKIE, "upgrade_session");
});
