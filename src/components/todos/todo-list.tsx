import Link from "next/link";
import { Check, Pencil, Plus, CheckSquare } from "lucide-react";
import type { Todo } from "@prisma/client";
import { TODO_PRIORITIES } from "@/lib/constants";
import { cn, dateInput, fmtDate } from "@/lib/utils";
import { Badge, Avatar, ButtonLink, SubmitButton, ConfirmForm, Collapsible, Field, FormGrid, EmptyState } from "@/components/ui";
import { createTodo, updateTodo, toggleTodo, deleteTodo } from "@/app/(app)/todos/actions";

export type TodoRow = Todo & {
  assignee: { id: string; name: string } | null;
  project: { id: string; number: number; name: string } | null;
};

type Staff = { id: string; name: string }[];
type ProjectOpt = { id: string; number: number; name: string }[];

function TodoFields({
  values,
  staff,
  projects,
  prefix,
  defaultAssigneeId,
}: {
  values: Partial<Todo>;
  staff: Staff;
  /** When provided, a project select is rendered (global list). */
  projects?: ProjectOpt;
  prefix: string;
  defaultAssigneeId?: string | null;
}) {
  return (
    <FormGrid className="md:grid-cols-4">
      <Field label="Title" htmlFor={`${prefix}-title`} className="md:col-span-4">
        <input id={`${prefix}-title`} name="title" className="input" required defaultValue={values.title ?? ""} placeholder="What needs to happen?" />
      </Field>
      <Field label="Description" htmlFor={`${prefix}-desc`} className="md:col-span-4">
        <textarea id={`${prefix}-desc`} name="description" className="input" rows={2} defaultValue={values.description ?? ""} />
      </Field>
      <Field label="Due date" htmlFor={`${prefix}-due`}>
        <input id={`${prefix}-due`} type="date" name="dueDate" className="input" defaultValue={dateInput(values.dueDate)} />
      </Field>
      <Field label="Priority" htmlFor={`${prefix}-priority`}>
        <select id={`${prefix}-priority`} name="priority" className="input" defaultValue={values.priority ?? "NORMAL"}>
          {TODO_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assignee" htmlFor={`${prefix}-assignee`}>
        <select id={`${prefix}-assignee`} name="assigneeId" className="input" defaultValue={values.assigneeId ?? defaultAssigneeId ?? ""}>
          <option value="">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      {projects ? (
        <Field label="Project" htmlFor={`${prefix}-project`}>
          <select id={`${prefix}-project`} name="projectId" className="input" defaultValue={values.projectId ?? ""}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </FormGrid>
  );
}

/**
 * Shared to-do list (server component). Used by /todos and the project To-Dos tab.
 * `basePath` is the current page path; filters are preserved via `query`.
 */
export function TodoList({
  todos,
  staff,
  projects,
  basePath,
  query,
  editId,
  show,
  assigneeFilter,
  currentUserId,
  projectId,
}: {
  todos: TodoRow[];
  staff: Staff;
  /** Provide on the global list to show project links + project select. */
  projects?: ProjectOpt;
  basePath: string;
  /** Current filter params (without `edit`). */
  query: Record<string, string | undefined>;
  editId?: string;
  show: "open" | "done" | "all";
  /** Only used on the global list. */
  assigneeFilter?: "me" | "all";
  currentUserId: string;
  /** Fixed project for the project tab. */
  projectId?: string;
}) {
  const today = new Date();
  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...extra })) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const returnTo = qs({});
  const isGlobal = !!projects;
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          {(["open", "done", "all"] as const).map((s) => (
            <Link key={s} href={qs({ show: s === "open" ? undefined : s })} className={chip(show === s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>
        {isGlobal ? (
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
            <Link href={qs({ assignee: undefined })} className={chip(assigneeFilter !== "all")}>
              Mine
            </Link>
            <Link href={qs({ assignee: "all" })} className={chip(assigneeFilter === "all")}>
              Everyone
            </Link>
          </div>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">
          {todos.length} item{todos.length === 1 ? "" : "s"}
        </span>
      </div>

      {todos.length === 0 ? (
        <EmptyState icon={CheckSquare} title={show === "done" ? "Nothing completed yet" : "All clear"} description={show === "open" ? "No open to-dos match these filters." : "No to-dos match these filters."} />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {todos.map((t) => {
            const done = t.status === "DONE";
            const overdue = !done && !!t.dueDate && t.dueDate < today && dateInput(t.dueDate) !== dateInput(today);
            if (editId === t.id) {
              return (
                <li key={t.id} className="bg-blue-50/50 px-4 py-4">
                  <form action={updateTodo} className="space-y-3">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <TodoFields values={t} staff={staff} projects={projects} prefix={`edit-${t.id}`} />
                    <div className="flex items-center gap-2">
                      <SubmitButton size="sm">Save</SubmitButton>
                      <ButtonLink href={returnTo} variant="secondary" size="sm">
                        Cancel
                      </ButtonLink>
                    </div>
                  </form>
                </li>
              );
            }
            return (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <form action={toggleTodo} className="pt-0.5">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    aria-label={done ? "Mark open" : "Mark done"}
                    title={done ? "Mark open" : "Mark done"}
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded border transition-colors",
                      done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("text-sm font-medium", done ? "text-slate-400 line-through" : "text-slate-900")}>{t.title}</span>
                    <Badge status={t.priority} />
                    {isGlobal && t.project ? (
                      <Link href={`/projects/${t.project.id}/todos`} className="text-xs text-blue-700 hover:underline">
                        #{t.project.number} {t.project.name}
                      </Link>
                    ) : null}
                  </div>
                  {t.description ? <p className="mt-0.5 text-sm text-slate-600">{t.description}</p> : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {t.assignee ? (
                      <span className="flex items-center gap-1">
                        <Avatar name={t.assignee.name} className="h-5 w-5 text-[9px]" /> {t.assignee.name}
                      </span>
                    ) : (
                      <span>Unassigned</span>
                    )}
                    {t.dueDate ? (
                      <span className={cn(overdue && "font-medium text-rose-600")}>
                        Due {fmtDate(t.dueDate)}
                        {overdue ? " · overdue" : ""}
                      </span>
                    ) : null}
                    {done && t.completedAt ? <span className="text-emerald-700">Done {fmtDate(t.completedAt)}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ButtonLink href={qs({ edit: t.id })} variant="ghost" size="sm" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </ButtonLink>
                  <ConfirmForm action={deleteTodo} hidden={{ id: t.id, returnTo }} message={`Delete "${t.title}"?`} variant="ghost">
                    Delete
                  </ConfirmForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Collapsible
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add to-do
          </span>
        }
      >
        <form action={createTodo} className="space-y-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
          <TodoFields values={{}} staff={staff} projects={projects} prefix="new" defaultAssigneeId={currentUserId} />
          <SubmitButton>Add to-do</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
