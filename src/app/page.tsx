import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  // Not signed in: the sign-in page. A sign-in that's no longer good (signed out everywhere, a
  // password change, deactivated) is cleared first — sending it straight to /login bounced it back
  // here forever ("redirected you too many times").
  const user = await requireUser();
  redirect(user.role === "CLIENT" ? "/portal" : user.role === "VENDOR" ? "/vendor" : "/dashboard");
}
