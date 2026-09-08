"use client";

import { useOptimistic, useState } from "react";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";
import { useSyncedAction } from "@/lib/sync/useSyncedAction";

import { updateDescriptionAction } from "./actions";

export function DescriptionEditor({
  taskId,
  slug,
  initial,
}: {
  taskId: string;
  slug: string;
  initial: string | null;
}) {
  const [desc, setOpt] = useOptimistic(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [, run] = useSyncedAction();

  function save(value: string) {
    setEditing(false);
    const next = value.trim();
    if (next === desc.trim()) return;
    run(
      () =>
        callAction(() => updateDescriptionAction(taskId, slug, next), {
          type: "updateTaskDescription",
          args: [taskId, next],
          entityId: taskId,
        }),
      "Couldn't update description",
      { optimistic: () => setOpt(next), onSuccess: () => toast.success("Updated description") },
    );
  }

  if (editing) {
    return (
      <textarea
        className="input description__input"
        autoFocus
        defaultValue={desc}
        placeholder="Add a description…"
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.blur();
        }}
      />
    );
  }

  return desc ? (
    <p className="description" title="Click to edit" onClick={() => setEditing(true)}>
      {desc}
    </p>
  ) : (
    <button
      type="button"
      className="description description--empty"
      onClick={() => setEditing(true)}
    >
      Add a description…
    </button>
  );
}
