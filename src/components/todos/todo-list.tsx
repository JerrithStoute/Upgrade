import Link from "@/components/link";
import { Check, Plus, CheckSquare } from "lucide-react";
import type { Todo } from "@prisma/client";
import { TODO_PRIORITIES } from "@/lib/constants";
import { cn, dateInput, fmtDate } from "@/lib/utils";
import { Badge, Avatar, SubmitButton, ConfirmForm, Field, FormGrid, EmptyState } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { createTodo, updateTodo, toggleTodo, deleteTodo } from "@/app/(app)/todos/actions";

export type TodoRow = Todo & {
  assignee: { id: string; name: string } | null;
  project: { id: string; number: number; name: string } | null;
};

type Staff = { id: string; name: string }[];
type ProjectOpt = { id: string; number: number; name: string }[];

/** Counts for the line above the card, whatever Open / Done / All is showing. */
export type TodoSummary = { open: number; done: number; overdue: string[] };

/** Past due and not done (due today isn't overdue). */
export function isOverdue(t: { status: string; dueDate: Date | null }, today: Date) {
  return t.status !== "DONE" && !!t.dueDate && t.dueDate < today && dateInput(t.dueDate) !== dateInput(today);
}

function TodoFields({
  values,
  staff,
  projects,
  prefix,
}: {
  values: Partial<Todo>;
  staff: Staff;
  /** When provided, a project select is rendered (global list). */
  projects?: ProjectOpt;
  prefix: string;
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
      <PrioritySelect id={`${prefix}-priority`} defaultValue={values.priority ?? "NORMAL"} label />
      <AssigneeSelect id={`${prefix}-assignee`} staff={staff} defaultValue={values.assigneeId ?? ""} label />
      {projects ? <ProjectSelect id={`${prefix}-project`} projects={projects} defaultValue={values.projectId ?? ""} label /> : null}
    </FormGrid>
  );
}

function PrioritySelect({ id, defaultValue, label }: { id: string; defaultValue: string; label?: boolean }) {
  const select = (
    <select id={id} name="priority" className={label ? "input" : "input h-8 py-1! text-sm"} defaultValue={defaultValue} aria-label={label ? undefined : "Priority"}>
      {TODO_PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {p.charAt(0) + p.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
  return label ? (
    <Field label="Priority" htmlFor={id}>
      {select}
    </Field>
  ) : (
    select
  );
}

function AssigneeSelect({ id, staff, defaultValue, label }: { id: string; staff: Staff; defaultValue: string; label?: boolean }) {
  const select = (
    <select id={id} name="assigneeId" className={label ? "input" : "input h-8 py-1! text-sm"} defaultValue={defaultValue} aria-label={label ? undefined : "Assignee"}>
      <option value="">Unassigned</option>
      {staff.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
  return label ? (
    <Field label="Assignee" htmlFor={id}>
      {select}
    </Field>
  ) : (
    select
  );
}

function ProjectSelect({ id, projects, defaultValue, label }: { id: string; projects: ProjectOpt; defaultValue: string; label?: boolean }) {
  const select = (
    <select id={id} name="projectId" className={label ? "input" : "input h-8 py-1! text-sm"} defaultValue={defaultValue} aria-label={label ? undefined : "Project"}>
      <option value="">No project</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.number} {p.name}
        </option>
      ))}
    </select>
  );
  return label ? (
    <Field label="Project" htmlFor={id}>
      {select}
    </Field>
  ) : (
    select
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
  adding,
  show,
  assigneeFilter,
  canSeeEveryone,
  summary,
  currentUserId,
  projectId,
  today,
}: {
  todos: TodoRow[];
  staff: Staff;
  /** Provide on the global list to show project links + project select. */
  projects?: ProjectOpt;
  basePath: string;
  /** Current filter params (without `edit` / `add`). */
  query: Record<string, string | undefined>;
  editId?: string;
  /** `?add=1`: the Add to-do box is open under the header. */
  adding?: boolean;
  show: "open" | "done" | "all";
  /** Only used on the global list. */
  assigneeFilter?: "me" | "all";
  /** Global list: whether Mine / Everyone shows. */
  canSeeEveryone?: boolean;
  summary: TodoSummary;
  currentUserId: string;
  /** Fixed project for the project tab. */
  projectId?: string;
  /** Today on the company's clock (for overdue). */
  today: Date;
}) {
  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...extra })) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const returnTo = qs({});
  const isGlobal = !!projects;
  const seg = (active: boolean) => cn("px-2.5 py-1 text-xs font-medium", active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50");

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {summary.open} open
        {summary.overdue.length ? (
          <>
            {" · "}
            <span className="font-medium text-rose-600">
              {summary.overdue.length} overdue: {summary.overdue.slice(0, 3).join(", ")}
              {summary.overdue.length > 3 ? ` and ${summary.overdue.length - 3} more` : ""}
            </span>
          </>
        ) : null}
        {" · "}
        {summary.done} done
      </p>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          {todos.length ? <ListFind listId="todo-list" placeholder="Find a to-do…" /> : null}
          <div className="flex overflow-hidden rounded-md ring-1 ring-inset ring-slate-200">
            {(["open", "done", "all"] as const).map((s) => (
              <Link key={s} href={qs({ show: s === "open" ? undefined : s })} className={seg(show === s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Link>
            ))}
          </div>
          {isGlobal && canSeeEveryone ? (
            <div className="flex overflow-hidden rounded-md ring-1 ring-inset ring-slate-200">
              <Link href={qs({ assignee: undefined })} className={seg(assigneeFilter !== "all")}>
                Mine
              </Link>
              <Link href={qs({ assignee: "all" })} className={seg(assigneeFilter === "all")}>
                Everyone
              </Link>
            </div>
          ) : null}
          <Link
            href={qs({ add: "1" })}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add to-do
          </Link>
        </header>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          {isGlobal
            ? "To-dos across every job, plus lead follow-ups and reminders. Check the box when it's done."
            : "Things to get done on this job. Check the box when it's done. Only your team sees them."}
        </p>

        {adding ? (
          <div className="border-b border-slate-100 bg-blue-50/50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Add to-do</span>
              <Link href={returnTo} className="text-xs font-medium text-blue-700 hover:underline">
                Cancel
              </Link>
            </div>
            <form action={createTodo} className="space-y-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <input name="title" className="input h-8 py-1! min-w-48 flex-[2] text-sm" required placeholder="What needs to happen?" aria-label="Title" autoFocus />
                <input type="date" name="dueDate" className="input h-8 py-1! w-auto text-sm" aria-label="Due date" />
                <div className="w-28">
                  <PrioritySelect id="new-priority" defaultValue="NORMAL" />
                </div>
                <div className="w-40">
                  <AssigneeSelect id="new-assignee" staff={staff} defaultValue={currentUserId} />
                </div>
                {projects ? (
                  <div className="w-48">
                    <ProjectSelect id="new-project" projects={projects} defaultValue="" />
                  </div>
                ) : null}
                <SubmitButton size="xs">Add</SubmitButton>
              </div>
              <details>
                <summary className="cursor-pointer list-none text-xs font-medium text-blue-700 hover:underline">+ Description</summary>
                <textarea name="description" className="input mt-1.5 text-sm" rows={2} aria-label="Description" />
              </details>
            </form>
          </div>
        ) : null}

        {todos.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={show === "done" ? "Nothing completed yet" : "All clear"}
            description={show === "open" ? "No open to-dos. Click Add to-do to make one." : "No to-dos match these filters."}
          />
        ) : (
          <div id="todo-list">
            <div data-find-group>
              <ul>
                {todos.map((t) => {
                  const done = t.status === "DONE";
                  const overdue = isOverdue(t, today);
                  if (editId === t.id) {
                    return (
                      <li key={t.id} className="border-t border-slate-100 bg-blue-50/50 px-4 py-3 first:border-t-0">
                        <form action={updateTodo} className="space-y-3">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-900">Edit to-do</span>
                            <Link href={returnTo} className="text-xs font-medium text-blue-700 hover:underline">
                              Cancel
                            </Link>
                          </div>
                          <TodoFields values={t} staff={staff} projects={projects} prefix={`edit-${t.id}`} />
                          <SubmitButton size="xs">Save</SubmitButton>
                        </form>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={t.id}
                      data-find={[t.title, t.description, t.assignee?.name, t.project ? `#${t.project.number} ${t.project.name}` : null]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase()}
                      className="flex items-start gap-3 border-t border-slate-100 px-4 py-2.5 first:border-t-0"
                    >
                      <form action={toggleTodo} className="pt-0.5">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          type="submit"
                          aria-label={done ? "Mark open" : "Mark done"}
                          title={done ? "Mark open" : "Mark done"}
                          className={cn(
                            "tap grid h-4 w-4 place-items-center rounded border transition-colors",
                            done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500",
                          )}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </button>
                      </form>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className={cn("text-sm font-medium", done ? "text-slate-400 line-through" : "text-slate-900")}>{t.title}</span>
                          {t.priority !== "NORMAL" ? <Badge status={t.priority} /> : null}
                          <span className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
                            {t.assignee ? (
                              <span className="flex items-center gap-1">
                                <Avatar name={t.assignee.name} className="h-4 w-4 text-[8px]" /> {t.assignee.name}
                              </span>
                            ) : (
                              <span>Unassigned</span>
                            )}
                            {t.dueDate ? (
                              <span className={cn(overdue && "font-medium text-rose-600")}>
                                {" · "}Due {fmtDate(t.dueDate)}
                                {overdue ? " · overdue" : ""}
                              </span>
                            ) : null}
                            {done && t.completedAt ? <span className="text-emerald-700"> · Done {fmtDate(t.completedAt)}</span> : null}
                            {isGlobal && t.project ? (
                              <>
                                {" · "}
                                <Link href={`/projects/${t.project.id}/todos`} className="text-blue-700 hover:underline">
                                  #{t.project.number} {t.project.name}
                                </Link>
                              </>
                            ) : null}
                            {t.leadId ? (
                              <>
                                {" · "}
                                <Link href={`/leads/${t.leadId}`} className="font-medium text-blue-700 hover:underline">
                                  Open lead
                                </Link>
                              </>
                            ) : null}
                          </span>
                        </div>
                        {t.description ? <p className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{t.description}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Link href={qs({ edit: t.id })} className="text-xs font-medium text-blue-700 hover:underline" aria-label={`Edit ${t.title}`}>
                          Edit
                        </Link>
                        <ConfirmForm action={deleteTodo} hidden={{ id: t.id, returnTo }} message={`Delete "${t.title}"?`} variant="ghost" size="xs">
                          <span className="text-rose-600">Delete…</span>
                        </ConfirmForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
