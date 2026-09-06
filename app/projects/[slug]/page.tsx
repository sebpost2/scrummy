import { notFound } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { TaskCard } from "@/app/_components/TaskCard";
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
  const navProjects = await prisma.projectMember.findMany({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });

  return (
    <>
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={navProjects.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
        currentSlug={slug}
      />
      <main className="container">
        <div className="stack">
          <PageHeader
            title={project.name}
            subtitle={`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
          />
          <NewTaskForm slug={slug} />
          <BoardFilterBar members={members.map((m) => ({ id: m.user.id, name: m.user.name }))} />

          <div className="board">
            {COLUMNS.map((col) => {
              const columnTasks = tasks.filter((t) => t.status === col.status);
              return (
                <section key={col.status} className="board__column">
                  <div className="board__column-head">
                    <h2>{col.label}</h2>
                    <span className="count">{columnTasks.length}</span>
                  </div>
                  {columnTasks.length === 0 ? (
                    <p className="board__empty">Nothing here</p>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        href={`/projects/${slug}/tasks/${task.id}`}
                        title={task.title}
                        priority={task.priority}
                        assigneeName={task.assignee?.name}
                        dueDate={task.dueDate}
                        labels={task.labels}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
