import "server-only";
import QRCode from "qrcode";
import { systemDb } from "./db";
import { seal, unseal } from "./secret-box";
import { newSecret, otpauthUrl } from "./totp";

/**
 * The secret for setting up the authenticator app: the one already waiting (so the code
 * on screen doesn't change if the page reloads mid-scan), or a new one. Null when
 * two-step is already on.
 */
export async function setupSecret(userId: string) {
  const user = await systemDb.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpSecret: true, totpEnabledAt: true } });
  if (user.totpEnabledAt) return null;
  let secret = user.totpSecret ? unseal(user.totpSecret) : null;
  if (!secret) {
    secret = newSecret();
    await systemDb.user.update({ where: { id: userId }, data: { totpSecret: seal(secret) } });
  }
  const qr = await QRCode.toDataURL(otpauthUrl(secret, user.email), { margin: 1, width: 360 });
  return { secret, qr };
}
