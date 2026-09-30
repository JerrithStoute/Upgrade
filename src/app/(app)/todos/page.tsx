import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { PageHeader } from "@/components/ui";
import { TodoList } from "@/components/todos/todo-list";

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ show?: string; assignee?: string; edit?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const show = sp.show === "done" || sp.show === "all" ? sp.show : "open";
  const assignee = sp.assignee === "all" ? "all" : "me";
  const where: Prisma.TodoWhereInput = {};
  if (show !== "all") where.status = show === "done" ? "DONE" : "OPEN";
  if (assignee === "me") where.assigneeId = user.id;
  const [todos, staff, projects] = await Promise.all([
    db.todo.findMany({
      where,
      orderBy: show === "done" ? [{ completedAt: "desc" }] : [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, number: true, name: true } } },
    }),
    staffUsers(),
    db.project.findMany({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader title="To-Dos" description="Action items across every project." />
      <TodoList
        todos={todos}
        staff={staff}
        projects={projects}
        basePath="/todos"
        query={{ show: sp.show, assignee: sp.assignee }}
        editId={sp.edit}
        show={show}
        assigneeFilter={assignee}
        currentUserId={user.id}
      />
    </div>
  );
}
