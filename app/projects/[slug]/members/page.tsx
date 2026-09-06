import { notFound } from "next/navigation";

import Avatar from "@/app/_components/Avatar";
import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { appOrigin } from "@/lib/auth/google";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";

import { AddMemberForm } from "./AddMemberForm";
import { InviteLinkCard } from "./InviteLinkCard";
import { RemoveMemberButton } from "./RemoveMemberButton";

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const membership = await getProjectMembership(user.id, project.id);
  if (!membership || membership.role !== "OWNER") notFound();

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
            title="Members"
            subtitle={project.name}
            actions={
              <a className="button button--secondary" href={`/projects/${slug}`}>
                Back to board
              </a>
            }
          />

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
                {m.role !== "OWNER" && (
                  <RemoveMemberButton slug={slug} userId={m.userId} name={m.user.name} />
                )}
              </li>
            ))}
          </ul>

          <InviteLinkCard slug={slug} url={`${appOrigin()}/invite/${project.inviteToken}`} />

          <section className="stack">
            <h2>Add a member</h2>
            <AddMemberForm slug={slug} />
          </section>
        </div>
      </main>
    </>
  );
}
