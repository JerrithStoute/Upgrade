import type { Prisma } from "@prisma/client";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { TodoList, isOverdue } from "@/components/todos/todo-list";
import { companyClock } from "@/lib/company-zone";

export default async function ProjectTodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string; edit?: string; add?: string }>;
}) {
  const user = await requireView("field");
  const { id } = await params;
  const sp = await searchParams;
  const project = await getProject(id);
  const show = sp.show === "done" || sp.show === "all" ? sp.show : "open";
  const where: Prisma.TodoWhereInput = { projectId: project.id };
  if (show !== "all") where.status = show === "done" ? "DONE" : "OPEN";
  const [todos, staff, open, done, { now: today }] = await Promise.all([
    db.todo.findMany({
      where,
      orderBy: show === "done" ? [{ completedAt: "desc" }] : [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, number: true, name: true } } },
    }),
    staffUsers(),
    db.todo.findMany({ where: { projectId: project.id, status: "OPEN" }, orderBy: { dueDate: "asc" }, select: { title: true, status: true, dueDate: true } }),
    db.todo.count({ where: { projectId: project.id, status: "DONE" } }),
    companyClock(),
  ]);
  return (
    <TodoList
      today={today}
      todos={todos}
      staff={staff}
      basePath={`/projects/${project.id}/todos`}
      query={{ show: sp.show }}
      editId={sp.edit}
      adding={!!sp.add}
      show={show}
      summary={{ open: open.length, done, overdue: open.filter((t) => isOverdue(t, today)).map((t) => t.title) }}
      currentUserId={user.id}
      projectId={project.id}
    />
  );
}
