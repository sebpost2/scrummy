"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { X } from "lucide-react";

import IconButton from "@/app/_components/IconButton";
import { toast } from "@/app/_components/toast";

import { addSubtaskAction, toggleSubtaskAction, deleteSubtaskAction } from "./actions";

type Item = { id: string; title: string; done: boolean };

export function Subtasks({
  taskId,
  slug,
  items,
}: {
  taskId: string;
  slug: string;
  items: Item[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(items);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const done = optimistic.filter((s) => s.done).length;

  return (
    <section className="stack">
      <h2>
        Subtasks{" "}
        {optimistic.length > 0 && (
          <span className="panel__label">
            {done}/{optimistic.length}
          </span>
        )}
      </h2>

      <ul className="subtasks">
        {optimistic.map((s) => (
          <li key={s.id} className="subtasks__item">
            <label className="subtasks__check">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) => {
                  const next = e.target.checked;
                  start(async () => {
                    setOptimistic(optimistic.map((x) => (x.id === s.id ? { ...x, done: next } : x)));
                    try {
                      await toggleSubtaskAction(s.id, taskId, slug, next);
                    } catch {
                      toast.error("Couldn't update the subtask");
                    }
                  });
                }}
              />
              <span className={s.done ? "subtasks__title subtasks__title--done" : "subtasks__title"}>
                {s.title}
              </span>
            </label>
            <IconButton
              label={`Delete ${s.title}`}
              onClick={() => {
                start(async () => {
                  setOptimistic(optimistic.filter((x) => x.id !== s.id));
                  try {
                    await deleteSubtaskAction(s.id, taskId, slug);
                  } catch {
                    toast.error("Couldn't delete the subtask");
                  }
                });
              }}
            >
              <X size={13} />
            </IconButton>
          </li>
        ))}
      </ul>

      <form
        className="composer"
        action={(formData) => {
          const title = String(formData.get("title") ?? "").trim();
          if (!title) return;
          if (inputRef.current) inputRef.current.value = "";
          start(async () => {
            try {
              await addSubtaskAction(taskId, slug, title);
            } catch {
              toast.error("Couldn't add the subtask");
            }
          });
        }}
      >
        <input ref={inputRef} name="title" placeholder="Add a subtask" className="input" />
        <button type="submit" className="button">
          Add
        </button>
      </form>
    </section>
  );
}
