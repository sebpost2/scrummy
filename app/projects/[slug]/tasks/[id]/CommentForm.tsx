"use client";

import { useActionState } from "react";

import Kbd from "@/app/_components/Kbd";

import { addCommentAction, type CommentState } from "./actions";

const initialState: CommentState = { status: "idle" };

export function CommentForm({ taskId, slug }: { taskId: string; slug: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction.bind(null, taskId, slug), initialState);

  return (
    <form action={formAction} className="form">
      <textarea
        name="comment"
        placeholder="Add a comment…"
        required
        className="input"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
        }}
      />
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Posting…" : "Comment"}
      </button>
      <p className="composer__hint"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to send</p>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
