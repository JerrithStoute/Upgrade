import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { TodoList } from "@/components/todos/todo-list";

export default async function ProjectTodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string; edit?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const project = await getProject(id);
  const show = sp.show === "done" || sp.show === "all" ? sp.show : "open";
  const where: Prisma.TodoWhereInput = { projectId: project.id };
  if (show !== "all") where.status = show === "done" ? "DONE" : "OPEN";
  const [todos, staff] = await Promise.all([
    db.todo.findMany({
      where,
      orderBy: show === "done" ? [{ completedAt: "desc" }] : [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, number: true, name: true } } },
    }),
    staffUsers(),
  ]);
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">To-dos</h2>
      <TodoList
        todos={todos}
        staff={staff}
        basePath={`/projects/${project.id}/todos`}
        query={{ show: sp.show }}
        editId={sp.edit}
        show={show}
        currentUserId={user.id}
        projectId={project.id}
      />
    </div>
  );
}
