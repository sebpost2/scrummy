// Derived from MUTATION_REGISTRY's keys (lib/sync/mutationRegistry.ts) so a new
// mutation only needs to be added there. `import type` erases this at build
// time, so it never pulls the registry's server-only code (prisma, etc.) into
// the client bundle.
import type { OutboxMutationType } from "@/lib/sync/mutationRegistry";
export type { OutboxMutationType };

export type OutboxStatus = "pending" | "syncing" | "failed-permanent";

export interface OutboxItem {
  id: string;
  type: OutboxMutationType;
  args: unknown[];
  clientTimestamp: number;
  entityId: string;
  status: OutboxStatus;
  failureMessage?: string;
  attempts?: number;
}
