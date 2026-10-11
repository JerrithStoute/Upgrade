/**
 * Create a company and its first admin (or reset that admin's password), without demo data.
 *
 *   npm run create-admin -- "Your Name" you@company.com "a-strong-password" "Company Name"
 *
 * An email signs in to one company: if the email exists, its company is kept and the
 * person is made an active admin with the new password (and signed out everywhere else).
 * Run by whoever runs the server, so the email counts as confirmed.
 */
import bcrypt from "bcryptjs";
import { db, systemDb } from "../src/lib/db";
import { runAsCompany } from "../src/lib/tenant";

const PASSWORD_ROUNDS = 12; // as src/lib/auth.ts

async function main() {
  const [name, email, password, companyName] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- "Your Name" you@company.com "password" ["Company Name"]');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
  const had = await systemDb.user.findUnique({ where: { email: email.toLowerCase() } });
  if (had) {
    await systemDb.user.update({ where: { id: had.id }, data: { name, passwordHash, role: "ADMIN", active: true, emailVerifiedAt: had.emailVerifiedAt ?? new Date(), sessionVersion: { increment: 1 } } });
    console.log(`Admin user reset: ${had.email}`);
    return;
  }
  const company = await systemDb.company.create({ data: { name: companyName || "My Construction Company" } });
  await runAsCompany(company.id, () => db.user.create({ data: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN", emailVerifiedAt: new Date() } }));
  console.log(`Company "${company.name}" and admin ${email.toLowerCase()} ready.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => systemDb.$disconnect());
