import { notFound } from "next/navigation";

import { Nav } from "@/app/_components/Nav";
import { requireUser } from "@/lib/auth/session";
import { getProjectMembership } from "@/lib/projects/mutations";
import { getProjectBySlug, getNavProjects } from "@/lib/projects/queries";
import { getNavNotifications } from "@/lib/notifications/queries";
import { getTaskWithEvents } from "@/lib/tasks/queries";

import { TaskProperties } from "./TaskProperties";
import { CommentForm } from "./CommentForm";
import { EditableTitle } from "./EditableTitle";
import { DescriptionEditor } from "./DescriptionEditor";
import { TaskActions } from "./TaskActions";
import { Subtasks } from "./Subtasks";
import Timeline from "./Timeline";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const user = await requireUser();
  const { slug, id } = await params;

  const detail = await getTaskWithEvents(id);
  const project = await getProjectBySlug(slug);
  if (!detail || !project || detail.project.id !== project.id) notFound();

  const membership = await getProjectMembership(user.id, detail.project.id);
  if (!membership) notFound();

  const navProjects = await getNavProjects(user.id);
  const notifications = await getNavNotifications(user.id);

  return (
    <>
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={navProjects.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
        currentSlug={slug}
        notifications={notifications}
      />
      <main className="container">
        <div className="stack">
          <header className="page-header">
            <div className="page-header__titles">
              <EditableTitle taskId={id} slug={slug} initial={detail.title} />
              <p className="page-header__subtitle">{detail.project.name}</p>
            </div>
            <div className="page-header__actions">
              <TaskActions taskId={id} slug={slug} />
            </div>
          </header>

          <div className="detail">
            <div className="stack">
              <DescriptionEditor taskId={id} slug={slug} initial={detail.description} />

              <Subtasks
                taskId={id}
                slug={slug}
                items={detail.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done }))}
              />

              <section className="stack">
                <h2>Activity</h2>
                <Timeline
                  currentUserId={user.id}
                  slug={slug}
                  taskId={id}
                  events={detail.events.map((ev) => ({
                    id: ev.id,
                    type: ev.type,
                    userId: ev.userId,
                    userName: ev.user.name,
                    comment: ev.comment,
                    createdAt: ev.createdAt,
                    editedAt: ev.editedAt,
                    deletedAt: ev.deletedAt,
                  }))}
                />
              </section>

              <section className="stack">
                <h2>Add a comment</h2>
                <CommentForm
                  taskId={id}
                  slug={slug}
                  members={detail.project.members
                    .filter((m) => m.user.id !== user.id)
                    .map((m) => ({ id: m.user.id, name: m.user.name }))}
                />
              </section>
            </div>

            <aside className="detail__side">
              <p className="panel__label">Properties</p>
              <TaskProperties
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
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
