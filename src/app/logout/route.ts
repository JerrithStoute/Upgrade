import { destroySession } from "@/lib/auth";

// Back to the sign-in page by its path alone: online, the address the program sees for a
// request is the host's internal one (localhost:10000), not app.thebuilderstation.com.
function toSignIn() {
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}

export async function POST() {
  await destroySession();
  return toSignIn();
}

export async function GET() {
  await destroySession();
  return toSignIn();
}
