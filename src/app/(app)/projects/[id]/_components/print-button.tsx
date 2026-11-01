"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print", small }: { label?: string; small?: boolean }) {
  return (
    <Button
      type="button"
      variant={small ? "secondary" : "primary"}
      size="sm"
      onClick={() => window.print()}
      className={small ? "no-print !h-7 !px-2.5 !text-xs" : "no-print"}
    >
      <Printer className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
