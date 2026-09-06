"use client";

import { useOptimistic, useState, useTransition } from "react";

import { toast } from "@/app/_components/toast";

import { updateTitleAction } from "./actions";

export function EditableTitle({
  taskId,
  slug,
  initial,
}: {
  taskId: string;
  slug: string;
  initial: string;
}) {
  const [title, setOpt] = useOptimistic(initial);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  function save(value: string) {
    setEditing(false);
    const next = value.trim();
    if (!next || next === title) return;
    start(async () => {
      setOpt(next);
      try {
        await updateTitleAction(taskId, slug, next);
        toast.success("Updated title");
      } catch {
        toast.error("Couldn't update title");
      }
    });
  }

  if (editing) {
    return (
      <input
        className="input editable-title__input"
        autoFocus
        defaultValue={title}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <h1
      className="editable-title"
      tabIndex={0}
      title="Click to edit"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {title}
    </h1>
  );
}
