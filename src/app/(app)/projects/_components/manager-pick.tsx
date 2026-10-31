"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Any manager" or one person: picking applies at once — no Filter button. */
export function ManagerPick({ managers, value }: { managers: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      value={value}
      aria-label="Manager"
      className="input !h-8 !w-40 !py-0 text-sm"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("managerId", e.target.value);
        else next.delete("managerId");
        const qs = next.toString();
        router.push(qs ? `${path}?${qs}` : path);
      }}
    >
      <option value="">Any manager</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
