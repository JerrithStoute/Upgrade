import { cn } from "@/lib/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <table className="w-full min-w-[600px] text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Tr({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("hover:bg-slate-50/60", className)}>{children}</tr>;
}

export function Th({ className, children, right }: { className?: string; children?: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-4 py-2.5 font-medium", right && "text-right", className)}>{children}</th>;
}

export function Td({ className, children, right }: { className?: string; children?: React.ReactNode; right?: boolean }) {
  return <td className={cn("px-4 py-2.5 align-top text-slate-700", right && "text-right tabular-nums", className)}>{children}</td>;
}

export function TFoot({ children }: { children: React.ReactNode }) {
  return <tfoot className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">{children}</tfoot>;
}
