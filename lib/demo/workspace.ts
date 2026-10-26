import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";
import {
  addTaskComment,
  createTask,
  reassignTask,
  updateTaskPriority,
  updateTaskStatus,
} from "@/lib/tasks/mutations";

/** Domain for throwaway demo accounts; never deliverable, so no real address can collide. */
export const DEMO_EMAIL_DOMAIN = "demo.scrummy.invalid";

/**
 * A fresh, private workspace per visitor: one board with a teammate and a short history, built
 * through the same mutations the app uses so every event is a real one. Each visitor gets their
 * own copy, so nobody's clicking around can wreck the demo for the next person.
 */
// ponytail: demo rows are never cleaned up (a few KB each, rate-limited); add a cron that deletes
// users @DEMO_EMAIL_DOMAIN older than a day if the table ever grows.
export async function createDemoWorkspace(): Promise<{ userId: string; slug: string }> {
  const tag = randomBytes(6).toString("hex");
  const you = await prisma.user.create({ data: { email: `${tag}@${DEMO_EMAIL_DOMAIN}`, name: "Dev" } });
  const priya = await prisma.user.create({
    data: { email: `${tag}-priya@${DEMO_EMAIL_DOMAIN}`, name: "Priya" },
  });

  const project = await createProject(you.id, "Website relaunch");
  await prisma.projectMember.create({ data: { userId: priya.id, projectId: project.id, role: "MEMBER" } });

  const timezone = await createTask(you.id, project.id, {
    title: "Fix timezone bug",
    description: "Due dates show a day early for users west of UTC.",
  });
  await updateTaskPriority(you.id, timezone.id, "HIGH");
  await reassignTask(you.id, timezone.id, priya.id);

  await createTask(you.id, project.id, { title: "Write release notes" });

  const filters = await createTask(priya.id, project.id, { title: "Board filters" });
  await updateTaskStatus(priya.id, filters.id, "IN_PROGRESS");
  await reassignTask(priya.id, filters.id, you.id);
  await addTaskComment(you.id, filters.id, "Filters live on staging");

  const auth = await createTask(you.id, project.id, { title: "Auth flow" });
  await updateTaskStatus(you.id, auth.id, "DONE");

  return { userId: you.id, slug: project.slug };
}
