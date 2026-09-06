"use client";

import { useActionState } from "react";

import { renameProjectAction, type RenameState } from "./actions";

const initial: RenameState = { status: "idle" };

export function RenameProjectForm({ slug, name }: { slug: string; name: string }) {
  const [state, formAction, pending] = useActionState(
    renameProjectAction.bind(null, slug),
    initial,
  );

  return (
    <form action={formAction} className="project-create">
      <input name="name" required defaultValue={name} className="input" aria-label="Project name" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Rename"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
