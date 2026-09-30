"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
