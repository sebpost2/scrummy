"use client";

import { useTransition } from "react";

import { toast } from "@/app/_components/toast";

// Shared by every client component that optimistically updates local state,
// calls a synced server action, and rolls the toast on success/failure.
export function useSyncedAction() {
  const [pending, start] = useTransition();

  function run(
    action: () => Promise<unknown>,
    errorMessage: string,
    options?: { optimistic?: () => void; onSuccess?: () => void },
  ): void {
    start(async () => {
      options?.optimistic?.();
      try {
        await action();
        options?.onSuccess?.();
      } catch {
        toast.error(errorMessage);
      }
    });
  }

  return [pending, run] as const;
}
