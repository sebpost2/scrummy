import { notFound } from "next/navigation";
import type { TaskPriority } from "@prisma/client";

import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";
import { getBoardTasks, type BoardFilters } from "@/lib/tasks/queries";

import Board from "./Board";
import { BoardFilterBar } from "./BoardFilterBar";
import type { BoardTask } from "./board-state";

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

  const boardTasks: BoardTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assigneeName: t.assignee?.name ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    labels: t.labels,
  }));

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
          <BoardFilterBar members={members.map((m) => ({ id: m.user.id, name: m.user.name }))} />

          <Board slug={slug} tasks={boardTasks} />
        </div>
      </main>
    </>
  );
}
