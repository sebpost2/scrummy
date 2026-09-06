"use client";

import { useTransition } from "react";
import { X } from "lucide-react";

import IconButton from "@/app/_components/IconButton";
import { toast } from "@/app/_components/toast";

import { removeMemberAction } from "./actions";

export function RemoveMemberButton({
  slug,
  userId,
  name,
}: {
  slug: string;
  userId: string;
  name: string;
}) {
  const [pending, start] = useTransition();

  return (
    <IconButton
      label={`Remove ${name}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove ${name} from this project?`)) return;
        start(async () => {
          const res = await removeMemberAction(slug, userId);
          if (!res.ok) toast.error(res.message);
          else toast.success(`Removed ${name}`);
        });
      }}
    >
      <X size={14} />
    </IconButton>
  );
}
