"use client";

import { useState, useTransition } from "react";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";

import { editCommentAction, deleteCommentAction } from "./actions";

export function CommentActions({
  eventId,
  taskId,
  slug,
  initial,
}: {
  eventId: string;
  taskId: string;
  slug: string;
  initial: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <form
        className="form"
        action={(formData) => {
          const value = String(formData.get("comment") ?? "");
          setEditing(false);
          start(async () => {
            try {
              await callAction(() => editCommentAction(eventId, taskId, slug, value), {
                type: "editTaskComment",
                args: [eventId, value],
                entityId: taskId,
              });
            } catch {
              toast.error("Couldn't save the comment");
            }
          });
        }}
      >
        <textarea name="comment" defaultValue={initial} required className="input" autoFocus />
        <div className="timeline__comment-foot">
          <button type="submit" className="button" disabled={pending}>
            Save
          </button>
          <button type="button" className="linkish" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <span className="timeline__comment-foot">
      <button type="button" className="linkish" onClick={() => setEditing(true)}>
        Edit
      </button>
      <button
        type="button"
        className="linkish linkish--danger"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this comment?")) return;
          start(async () => {
            try {
              await callAction(() => deleteCommentAction(eventId, taskId, slug), {
                type: "deleteTaskComment",
                args: [eventId],
                entityId: taskId,
              });
            } catch {
              toast.error("Couldn't delete the comment");
            }
          });
        }}
      >
        Delete
      </button>
    </span>
  );
}
