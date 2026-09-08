import { prisma } from "@/lib/db/prisma";

export function getProjectBySlug(slug: string) {
  return prisma.project.findUnique({ where: { slug } });
}

export function getNavProjects(userId: string) {
  return prisma.projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });
}
