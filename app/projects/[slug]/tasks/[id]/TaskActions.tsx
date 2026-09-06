"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";

import Menu, { MenuItem } from "@/app/_components/Menu";
import { toast } from "@/app/_components/toast";

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
            const res = await deleteTaskAction(taskId, slug);
            if (res && !res.ok) toast.error(res.message);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete task"}
      </MenuItem>
    </Menu>
  );
}
