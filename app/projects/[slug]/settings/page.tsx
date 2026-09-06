import { notFound } from "next/navigation";

import Avatar from "@/app/_components/Avatar";
import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";

import { RenameProjectForm } from "./RenameProjectForm";
import { MemberRoleToggle } from "./MemberRoleToggle";
import { SettingsDangerZone } from "./SettingsDangerZone";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const membership = await getProjectMembership(user.id, project.id);
  if (!membership) notFound();

  const isOwner = membership.role === "OWNER";
  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  const ownerCount = members.filter((m) => m.role === "OWNER").length;

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
            title="Settings"
            subtitle={project.name}
            actions={
              <a className="button button--secondary" href={`/projects/${slug}`}>
                Back to board
              </a>
            }
          />

          {isOwner && (
            <section className="stack">
              <h2>Project name</h2>
              <RenameProjectForm slug={slug} name={project.name} />
            </section>
          )}

          {isOwner && (
            <section className="stack">
              <h2>Roles</h2>
              <ul className="member-list">
                {members.map((m) => (
                  <li key={m.userId} className="member-list__item">
                    <Avatar name={m.user.name} size="md" />
                    <div className="member-list__id">
                      <span className="member-list__name">{m.user.name}</span>
                      <span className="member-list__email">{m.user.email}</span>
                    </div>
                    <span className={`badge${m.role === "OWNER" ? " badge--status-in_progress" : ""}`}>
                      {m.role === "OWNER" ? "Owner" : "Member"}
                    </span>
                    {!(m.role === "OWNER" && ownerCount === 1) && (
                      <MemberRoleToggle
                        slug={slug}
                        userId={m.userId}
                        name={m.user.name}
                        role={m.role}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="stack">
            <h2>Danger zone</h2>
            <SettingsDangerZone
              slug={slug}
              canDelete={isOwner}
              canLeave={!(isOwner && ownerCount === 1)}
            />
          </section>
        </div>
      </main>
    </>
  );
}
