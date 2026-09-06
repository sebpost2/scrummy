"use client";

import { useActionState } from "react";

import { addMemberAction, type AddMemberState } from "./actions";

const initialState: AddMemberState = { status: "idle" };

export function AddMemberForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(addMemberAction.bind(null, slug), initialState);

  return (
    <form action={formAction} className="project-create">
      <input type="email" name="email" placeholder="teammate@example.com" required className="input" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Adding…" : "Add member"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
