"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { createTaskAction, type NewTaskState } from "./actions";

const initial: NewTaskState = { status: "idle" };

export default function InlineTaskComposer({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createTaskAction.bind(null, slug),
    initial,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (state.status === "idle" && inputRef.current) inputRef.current.value = "";
  }, [state]);

  if (!open) {
    return (
      <button className="composer__open" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add task
      </button>
    );
  }

  return (
    <form action={formAction} className="composer" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <input ref={inputRef} name="title" required placeholder="Task title" className="input" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
