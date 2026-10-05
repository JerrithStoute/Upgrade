"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { openClientView } from "../client-view-actions";

/** Which of the client's pages matches the job page you're on (null = their home). */
function clientPage(pathname: string, projectId: string): { page: string | null; label: string } {
  const rest = pathname.replace(`/projects/${projectId}`, "").split("/").filter(Boolean);
  const [tab, id] = rest;
  const one = id && id !== "new" ? id : null;
  if (tab === "selections") return { page: "selections", label: "their Selections" };
  if (tab === "change-orders") return one ? { page: `change-orders/${one}`, label: "this change order" } : { page: "change-orders", label: "their Change Orders" };
  if (tab === "invoices") return one ? { page: `invoices/${one}`, label: "this invoice" } : { page: "invoices", label: "their Invoices" };
  if (tab === "files") return { page: "files", label: "their Photos & Files" };
  if (tab === "schedule") return { page: "schedule", label: "their Schedule" };
  if (tab === "messages") return { page: "messages", label: "their Messages" };
  return { page: null, label: "their home page" };
}

/** The job header's Client view: opens the client's version of the page you're on. */
export function ClientViewButton({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const [busy, start] = useTransition();
  const { page, label } = clientPage(pathname, projectId);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClasses("secondary", "sm")}
      title={`See ${label} exactly as your client does (look only)`}
      onClick={() => start(() => openClientView(projectId, page))}
    >
      <Eye className="h-3.5 w-3.5" /> {busy ? "Opening…" : "Client view"}
    </button>
  );
}
