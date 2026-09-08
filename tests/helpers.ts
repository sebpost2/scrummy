import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";

const trackedUsers: string[] = [];
const trackedProjects: string[] = [];

export async function createTestUser(data: { name: string }): Promise<{ id: string; email: string }> {
  const email = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: { email, name: data.name, passwordHash: "test" },
  });
  trackedUsers.push(user.id);
  return { id: user.id, email: user.email };
}

export async function createTestProject(
  userId: string,
  name: string,
): Promise<{ id: string; projectId: string }> {
  const project = await createProject(userId, name);
  trackedProjects.push(project.id);
  return { id: project.id, projectId: project.id };
}

export async function cleanupTestData(): Promise<void> {
  // Delete all tracked projects and their associated data
  await prisma.notification.deleteMany({ where: { task: { projectId: { in: trackedProjects } } } });
  await prisma.task.deleteMany({ where: { projectId: { in: trackedProjects } } });
  await prisma.projectMember.deleteMany({ where: { projectId: { in: trackedProjects } } });
  await prisma.project.deleteMany({ where: { id: { in: trackedProjects } } });

  // Delete all tracked users
  await prisma.user.deleteMany({ where: { id: { in: trackedUsers } } });

  // Clear the tracking arrays
  trackedUsers.length = 0;
  trackedProjects.length = 0;
}
