import { notFound } from "next/navigation";

import { Nav } from "@/app/_components/Nav";
import { requireUser } from "@/lib/auth/session";
import { getProjectMembership } from "@/lib/projects/mutations";
import { getTaskWithEvents } from "@/lib/tasks/queries";
import { prisma } from "@/lib/db/prisma";

import { TaskControls } from "./TaskControls";
import { CommentForm } from "./CommentForm";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const user = await requireUser();
  const { slug, id } = await params;

  const detail = await getTaskWithEvents(id);
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!detail || !project || detail.project.id !== project.id) notFound();

  const membership = await getProjectMembership(user.id, detail.project.id);
  if (!membership) notFound();

  return (
    <main className="container">
      <Nav />
      <h1>{detail.title}</h1>
      {detail.description && <p>{detail.description}</p>}
      <TaskControls
        task={{
          id: detail.id,
          status: detail.status,
          assigneeId: detail.assigneeId,
          priority: detail.priority,
          dueDate: detail.dueDate,
          labels: detail.labels,
        }}
        slug={slug}
        members={detail.project.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
      />
      <h2>Activity</h2>
      <ul className="timeline">
        {detail.events.map((event) => (
          <li key={event.id} className="timeline__item">
            <div className="timeline__meta">
              {event.user.name} · {event.type} · {event.createdAt.toISOString()}
            </div>
            {event.comment && <div>{event.comment}</div>}
          </li>
        ))}
      </ul>
      <CommentForm taskId={id} slug={slug} />
    </main>
  );
}
