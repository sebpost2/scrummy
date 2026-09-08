"use client";

import { useActionState, useRef, useState, useEffect } from "react";

import Kbd from "@/app/_components/Kbd";

import { addCommentAction, type CommentState } from "./actions";

const initialState: CommentState = { status: "idle" };

type Member = { id: string; name: string };

export function CommentForm({
  taskId,
  slug,
  members,
}: {
  taskId: string;
  slug: string;
  members: Member[];
}) {
  const [state, formAction, pending] = useActionState(addCommentAction.bind(null, taskId, slug), initialState);
  const [mentioned, setMentioned] = useState<Member[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);

  // React resets uncontrolled form fields after a successful action, but
  // `mentioned` is separate component state, not a form field — it needs its
  // own reset on the pending->idle-success transition, or a mention would
  // leak into the next comment.
  useEffect(() => {
    if (wasPending.current && !pending && state.status === "idle") setMentioned([]);
    wasPending.current = pending;
  }, [pending, state]);

  const matches =
    query === null
      ? []
      : members.filter((m) => m.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;

    const upToCursor = el.value.slice(0, el.selectionStart ?? 0);
    const match = /(?:^|\s)@(\w*)$/.exec(upToCursor);
    setQuery(match ? match[1] : null);
  }

  function pickMention(member: Member) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    const upToCursor = el.value.slice(0, cursor);
    const start = upToCursor.search(/@(\w*)$/);
    if (start === -1) return;
    const before = el.value.slice(0, start);
    const after = el.value.slice(cursor);
    const insertion = `@${member.name} `;
    el.value = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    el.selectionStart = el.selectionEnd = nextCursor;
    el.focus();
    setQuery(null);
    setMentioned((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
  }

  return (
    <form action={formAction} className="form">
      <div className="composer">
        <textarea
          ref={textareaRef}
          name="comment"
          placeholder="Add a comment… (@ to mention)"
          required
          className="input"
          onInput={handleInput}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
            if (e.key === "Escape") setQuery(null);
          }}
        />
        {matches.length > 0 && (
          <ul className="mention-picker" role="listbox">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" className="mention-picker__item" onClick={() => pickMention(m)}>
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {mentioned.map((m) => (
        <input key={m.id} type="hidden" name="mentionedUserIds" value={m.id} />
      ))}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Posting…" : "Comment"}
      </button>
      <p className="composer__hint"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to send</p>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
