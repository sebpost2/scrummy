"use client";

import { useTransition } from "react";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";

import { deleteProjectAction, leaveProjectAction } from "./actions";

export function SettingsDangerZone({
  slug,
  canDelete,
  canLeave,
}: {
  slug: string;
  canDelete: boolean;
  canLeave: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="danger-zone">
      {canLeave && (
        <button
          type="button"
          className="button button--secondary"
          disabled={pending}
          onClick={() => {
            if (!confirm("Leave this project? You'll lose access to its board.")) return;
            start(async () => {
              const res = await callAction(() => leaveProjectAction(slug), {
                type: "leaveProject",
                args: [slug],
                entityId: slug,
              });
              if (res === undefined) {
                toast.info("Leaving once you're back online.");
                return;
              }
              if (res && !res.ok) toast.error(res.message);
            });
          }}
        >
          Leave project
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="button button--danger"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this project for everyone? All its tasks and history are removed. This can't be undone."))
              return;
            start(async () => {
              const res = await callAction(() => deleteProjectAction(slug), {
                type: "deleteProject",
                args: [slug],
                entityId: slug,
              });
              if (res === undefined) {
                toast.info("Deleting once you're back online.");
                return;
              }
              if (res && !res.ok) toast.error(res.message);
            });
          }}
        >
          Delete project
        </button>
      )}
    </div>
  );
}
