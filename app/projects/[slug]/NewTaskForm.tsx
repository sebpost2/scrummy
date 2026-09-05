"use client";

import { useActionState } from "react";

import { createTaskAction, type NewTaskState } from "./actions";

const initialState: NewTaskState = { status: "idle" };

export function NewTaskForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(createTaskAction.bind(null, slug), initialState);

  return (
    <form action={formAction} className="form">
      <input type="text" name="title" placeholder="New task title" required className="input" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
