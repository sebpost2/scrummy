"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";

import Menu, { MenuItem } from "@/app/_components/Menu";
import { callActionForResult } from "@/lib/sync/callAction";

import { deleteTaskAction } from "./actions";

export function TaskActions({ taskId, slug }: { taskId: string; slug: string }) {
  const [pending, start] = useTransition();

  return (
    <Menu label="Task actions" trigger={<MoreHorizontal size={16} />}>
      <MenuItem
        danger
        onSelect={() => {
          if (!confirm("Delete this task? This can't be undone.")) return;
          start(async () => {
            await callActionForResult(
              () => deleteTaskAction(taskId, slug),
              { type: "deleteTask", args: [taskId], entityId: taskId },
              "Deleting once you're back online.",
            );
          });
        }}
      >
        {pending ? "Deleting…" : "Delete task"}
      </MenuItem>
    </Menu>
  );
}
