import Link from "next/link";

import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { EmptyState } from "@/app/_components/EmptyState";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getNavNotifications } from "@/lib/notifications/queries";

import { NewProjectForm } from "./NewProjectForm";

export default async function ProjectsPage() {
  const user = await requireUser();
  const notifications = await getNavNotifications(user.id);

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    include: {
      project: { include: { _count: { select: { tasks: true } } } },
    },
    orderBy: { project: { createdAt: "desc" } },
  });

  return (
    <>
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={memberships.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
        notifications={notifications}
      />
      <main className="container">
        <div className="stack">
          <PageHeader title="Your projects" subtitle="Boards you own or belong to." />

          {memberships.length === 0 ? (
            <EmptyState
              title="No projects yet"
              body="Create your first project below to start tracking work on a board."
            />
          ) : (
            <div className="project-grid">
              {memberships.map((m) => (
                <Link key={m.projectId} href={`/projects/${m.project.slug}`} className="project-card">
                  <span className="project-card__name">{m.project.name}</span>
                  <span className="project-card__meta">
                    {m.project._count.tasks} {m.project._count.tasks === 1 ? "task" : "tasks"}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <NewProjectForm />
        </div>
      </main>
    </>
  );
}
