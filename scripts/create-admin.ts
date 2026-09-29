/**
 * Create (or reset) an admin user and the company record without loading demo data.
 *
 *   npm run create-admin -- "Your Name" you@company.com "a-strong-password" "Company Name"
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const [name, email, password, companyName] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- "Your Name" you@company.com "password" ["Company Name"]');
    process.exit(1);
  }
  const company = await db.company.findFirst();
  if (!company) {
    await db.company.create({ data: { name: companyName || "My Construction Company" } });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, passwordHash, role: "ADMIN", active: true },
    create: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN" },
  });
  console.log(`Admin user ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
