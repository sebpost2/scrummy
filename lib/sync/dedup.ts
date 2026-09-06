import { prisma } from "@/lib/db/prisma";

export async function alreadyApplied(clientMutationId: string): Promise<boolean> {
  const row = await prisma.syncedMutation.findUnique({ where: { id: clientMutationId } });
  return row !== null;
}

export async function markApplied(clientMutationId: string): Promise<void> {
  await prisma.syncedMutation.create({ data: { id: clientMutationId } });
}
