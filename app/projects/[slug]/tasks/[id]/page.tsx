import { notFound } from "next/navigation";
import type { TaskEventType } from "@prisma/client";

import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { getProjectMembership } from "@/lib/projects/mutations";
import { getTaskWithEvents } from "@/lib/tasks/queries";
import { prisma } from "@/lib/db/prisma";

import { TaskControls } from "./TaskControls";
import { CommentForm } from "./CommentForm";

const EVENT_LABEL: Record<TaskEventType, string> = {
  CREATED: "created this task",
  STATUS_CHANGED: "changed the status",
  REASSIGNED: "reassigned it",
  PRIORITY_CHANGED: "changed the priority",
  DUE_DATE_CHANGED: "changed the due date",
  LABELS_CHANGED: "updated the labels",
  EDITED: "edited the task",
  COMMENTED: "commented",
};

function formatTimestamp(date: Date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

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
          <PageHeader title={detail.title} subtitle={detail.project.name} />
          {detail.description && <p className="description">{detail.description}</p>}

          <div className="panel">
            <p className="panel__label">Details</p>
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
          </div>

          <section className="stack">
            <h2>Activity</h2>
            <ul className="timeline">
              {detail.events.map((event) => (
                <li
                  key={event.id}
                  className={`timeline__item${event.type === "COMMENTED" ? " timeline__item--comment" : ""}`}
                >
                  <div className="timeline__head">
                    <span className="timeline__actor">{event.user.name}</span>
                    <span className="timeline__event">{EVENT_LABEL[event.type]}</span>
                    <time className="timeline__time" dateTime={event.createdAt.toISOString()}>
                      {formatTimestamp(event.createdAt)}
                    </time>
                  </div>
                  {event.comment && <p className="timeline__comment">{event.comment}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className="stack">
            <h2>Add a comment</h2>
            <CommentForm taskId={id} slug={slug} />
          </section>
        </div>
      </main>
    </>
  );
}
