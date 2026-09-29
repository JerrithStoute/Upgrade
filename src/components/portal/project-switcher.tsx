"use client";

import { usePathname, useRouter } from "next/navigation";

/** Select that switches the active portal project via `?project=`. */
export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: { id: string; number: number; name: string }[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="hidden sm:inline">Project</span>
      <select
        className="input !w-auto max-w-[260px]"
        value={currentId}
        onChange={(e) => router.push(`${pathname}?project=${e.target.value}`)}
        aria-label="Switch project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            #{p.number} · {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
