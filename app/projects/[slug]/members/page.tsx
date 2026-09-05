import { notFound } from "next/navigation";

import { Nav } from "@/app/_components/Nav";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";

import { AddMemberForm } from "./AddMemberForm";

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const membership = await getProjectMembership(user.id, project.id);
  if (!membership || membership.role !== "OWNER") notFound();

  const members = await prisma.projectMember.findMany({ where: { projectId: project.id }, include: { user: true } });

  return (
    <main className="container">
      <Nav />
      <h1>{project.name} — Members</h1>
      <ul>
        {members.map((m) => (
          <li key={m.userId}>
            {m.user.name} ({m.user.email}) — {m.role}
          </li>
        ))}
      </ul>
      <AddMemberForm slug={slug} />
    </main>
  );
}
