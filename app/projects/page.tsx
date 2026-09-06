import Link from "next/link";

import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { EmptyState } from "@/app/_components/EmptyState";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

import { NewProjectForm } from "./NewProjectForm";

export default async function ProjectsPage() {
  const user = await requireUser();

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });

  return (
    <>
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={memberships.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
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
                  <span className="project-card__go">Open board</span>
                </Link>
              ))}
            </div>
          )}

          <section className="stack">
            <h2>Create a project</h2>
            <NewProjectForm />
          </section>
        </div>
      </main>
    </>
  );
}
