import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";

let userIds: string[] = [];
let projectIds: string[] = [];

export async function createTestUser(
  opts: { name?: string; email?: string; passwordHash?: string } = {},
) {
  const {
    name = "Test User",
    email = `test-${crypto.randomUUID()}@example.com`,
    passwordHash = "x",
  } = opts;
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  userIds.push(user.id);
  return user;
}

export async function createTestProject(ownerId: string, name = "Test Project") {
  const project = await createProject(ownerId, name);
  projectIds.push(project.id);
  return project;
}

// For tests that create a project via raw prisma calls (e.g. schema tests)
// instead of createTestProject, so it still gets cleaned up.
export function trackProject(id: string): void {
  projectIds.push(id);
}

// Projects must be deleted before their owning users: Project.createdBy has
// no cascade rule, so deleting the owner first violates a foreign key.
export async function cleanupTestData(): Promise<void> {
  if (projectIds.length) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds = [];
  projectIds = [];
}
