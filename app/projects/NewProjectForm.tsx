"use client";

import { useActionState } from "react";

import { createProjectAction, type NewProjectState } from "./actions";

const initialState: NewProjectState = { status: "idle" };

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initialState);

  return (
    <form action={formAction} className="form">
      <input type="text" name="name" placeholder="Project name" required className="input" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
