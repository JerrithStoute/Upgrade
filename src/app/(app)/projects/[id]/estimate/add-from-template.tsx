"use client";

import { ChevronDown, FileStack, Plus } from "lucide-react";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import { addTemplateToEstimate } from "./actions";

/** "Add from template" on a draft's toolbar: pick one of your templates and its lines are added. */
export function AddFromTemplate({ projectId, estimateId, templates }: { projectId: string; estimateId: string; templates: { id: string; name: string; lines: number }[] }) {
  return (
    <details className="group relative">
      <summary className={cn(buttonClasses("secondary", "xs"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        <FileStack className="h-3.5 w-3.5" /> Add from template <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <form action={addTemplateToEstimate} className="absolute right-0 z-30 mt-1 w-72 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="estimateId" value={estimateId} />
        <select name="templateId" aria-label="Template to add" className="input !h-7 !py-0 text-xs" required defaultValue="">
          <option value="" disabled>
            Choose a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.lines} lines)
            </option>
          ))}
        </select>
        <SubmitButton size="xs" variant="secondary" className="w-full">
          <Plus className="h-3.5 w-3.5" /> Add its lines
        </SubmitButton>
        <p className="text-xs text-slate-500">Adds the template&apos;s categories and items to this draft.</p>
      </form>
    </details>
  );
}
