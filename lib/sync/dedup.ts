import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function alreadyApplied(clientMutationId: string): Promise<boolean> {
  const row = await prisma.syncedMutation.findUnique({ where: { id: clientMutationId } });
  return row !== null;
}

export async function markApplied(clientMutationId: string): Promise<void> {
  try {
    await prisma.syncedMutation.create({ data: { id: clientMutationId } });
  } catch (err) {
    // The page and the service worker are separate JS contexts, each with its
    // own in-flight guard, so two replays can still race on the same mutation.
    // The row already being there is exactly the state we wanted.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
