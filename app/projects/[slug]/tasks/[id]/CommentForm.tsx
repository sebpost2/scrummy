"use client";

import { useActionState } from "react";

import { addCommentAction, type CommentState } from "./actions";

const initialState: CommentState = { status: "idle" };

export function CommentForm({ taskId, slug }: { taskId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction.bind(null, taskId, slug), initialState);

  return (
    <form action={formAction} className="form">
      <textarea name="comment" placeholder="Add a comment…" required className="input" />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Posting…" : "Comment"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
