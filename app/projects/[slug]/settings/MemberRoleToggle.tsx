"use client";

import { useTransition } from "react";
import type { ProjectRole } from "@prisma/client";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";

import { updateMemberRoleAction } from "./actions";

export function MemberRoleToggle({
  slug,
  userId,
  name,
  role,
}: {
  slug: string;
  userId: string;
  name: string;
  role: ProjectRole;
}) {
  const [pending, start] = useTransition();
  const next: ProjectRole = role === "OWNER" ? "MEMBER" : "OWNER";

  return (
    <button
      type="button"
      className="button button--secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await callAction(() => updateMemberRoleAction(slug, userId, next), {
            type: "updateMemberRole",
            args: [slug, userId, next],
            entityId: userId,
          });
          if (res === undefined) {
            toast.info("Updating once you're back online.");
            return;
          }
          if (!res.ok) toast.error(res.message);
          else toast.success(next === "OWNER" ? `${name} is now an owner` : `${name} is now a member`);
        })
      }
    >
      {pending ? "Saving…" : next === "OWNER" ? "Make owner" : "Make member"}
    </button>
  );
}
