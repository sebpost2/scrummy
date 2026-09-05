import { notFound } from "next/navigation";
import Link from "next/link";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";
import { getBoardTasks, type BoardFilters } from "@/lib/tasks/queries";

import { BoardFilterBar } from "./BoardFilterBar";
import { NewTaskForm } from "./NewTaskForm";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "DONE", label: "Done" },
];

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ assignee?: string; label?: string; priority?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const query = await searchParams;

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const membership = await getProjectMembership(user.id, project.id);
  if (!membership) notFound();

  const filters: BoardFilters = {
    assigneeId: query.assignee || undefined,
    label: query.label || undefined,
    priority: (query.priority as TaskPriority) || undefined,
  };
  const tasks = await getBoardTasks(project.id, filters);
  const members = await prisma.projectMember.findMany({ where: { projectId: project.id }, include: { user: true } });

  return (
    <main className="container">
      <h1>{project.name}</h1>
      <BoardFilterBar members={members.map((m) => ({ id: m.user.id, name: m.user.name }))} />
      <NewTaskForm slug={slug} />
      <div className="board">
        {COLUMNS.map((col) => (
          <section key={col.status} className="board__column">
            <h2>{col.label}</h2>
            {tasks
              .filter((t) => t.status === col.status)
              .map((task) => (
                <Link key={task.id} href={`/projects/${slug}/tasks/${task.id}`} className="card">
                  <div className="card__title">{task.title}</div>
                  <div className="card__meta">
                    <span className="badge">{task.priority}</span>
                    {task.assignee && <span className="badge">{task.assignee.name}</span>}
                    {task.dueDate && <span className="badge">{task.dueDate.toISOString().slice(0, 10)}</span>}
                    {task.labels.map((label) => (
                      <span key={label} className="badge">
                        {label}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
          </section>
        ))}
      </div>
    </main>
  );
}
