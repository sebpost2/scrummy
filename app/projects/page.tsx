import Link from "next/link";

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
    <main className="container">
      <h1>Your projects</h1>
      {memberships.length === 0 ? (
        <p>You have no projects yet.</p>
      ) : (
        <ul>
          {memberships.map((m) => (
            <li key={m.projectId}>
              <Link href={`/projects/${m.project.slug}`}>{m.project.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <h2>Create a project</h2>
      <NewProjectForm />
    </main>
  );
}
