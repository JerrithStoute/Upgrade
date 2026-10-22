"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui";
import { actionMessage } from "@/lib/action-message";
import { sendAllBidEmails } from "../actions";
import { useSendHow } from "./send-how";

/** "Email all": every bid not emailed yet goes to its vendor's email on file, with the usual message. */
export function EmailAllButton({ projectId, count }: { projectId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [how] = useSendHow();
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={async () => {
          const way = `${how.attach ? "with its Excel file and PDF attached" : "with its link to type prices online (Excel and PDF on that page)"}${how.copyMe ? ", and a copy to you" : ""}`;
          if (!window.confirm(`Email ${count === 1 ? "the bid that hasn't" : `the ${count} bids that haven't`} been emailed yet — each to its vendor, ${way}?`)) return;
          setBusy(true);
          setNote(null);
          try {
            const r = await sendAllBidEmails({ projectId, how });
            if ("error" in r) setNote({ text: r.error, bad: true });
            else {
              const parts = [
                r.sent.length ? `Sent to ${r.sent.join(", ")}.` : "",
                r.skipped.length ? `No email on file for ${r.skipped.join(", ")} — open their bid's Email to type one.` : "",
                r.failed.length ? `Didn't go out to ${r.failed.join(", ")} — try those again.` : "",
              ].filter(Boolean);
              setNote({ text: parts.join(" ") || "Nothing to send.", bad: !!(r.skipped.length || r.failed.length) });
              router.refresh();
            }
          } catch (e) {
            setNote({ text: actionMessage(e, "The emails didn't go out"), bad: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : `Email all (${count})`}
      </Button>
      {note ? <span className={note.bad ? "text-xs text-amber-800" : "text-xs text-emerald-700"}>{note.text}</span> : null}
    </span>
  );
}
