import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth";
import { HOME_COOKIE } from "@/lib/customer-brand";
import { validSlug } from "@/lib/sign-in-slug";

// Back to the sign-in page by its path alone: online, the address the program sees for a
// request is the host's internal one (localhost:10000), not app.thebuilderstation.com.
// A client or sub goes back to their builder's own sign-in page.
async function toSignIn() {
  const home = (await cookies()).get(HOME_COOKIE)?.value;
  return new Response(null, { status: 303, headers: { Location: validSlug(home) ? `/login/${home}` : "/login" } });
}

export async function POST() {
  await destroySession();
  return toSignIn();
}

export async function GET() {
  await destroySession();
  return toSignIn();
}
