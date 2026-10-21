import { redirect } from "next/navigation";

/** The Station's front page: the Builders list. */
export default function StationHome() {
  redirect("/station/builders");
}
