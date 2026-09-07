"use client";

import { useState, useTransition } from "react";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";

import { regenerateInviteTokenAction } from "./actions";

export function InviteLinkCard({ slug, url }: { slug: string; url: string }) {
  const [link, setLink] = useState(url);
  const [pending, start] = useTransition();

  function copy() {
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Invite link copied"))
      .catch(() => toast.error("Couldn't copy — select the link and copy it manually"));
  }

  function regenerate() {
    if (!confirm("Generate a new invite link? The old one will stop working.")) return;
    start(async () => {
      const res = await callAction(() => regenerateInviteTokenAction(slug), {
        type: "regenerateInviteToken",
        args: [slug],
        entityId: slug,
      });
      if (res === undefined) {
        toast.info("Regenerating once you're back online.");
        return;
      }
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setLink(res.url);
      toast.success("New invite link created");
    });
  }

  return (
    <section className="stack">
      <h2>Invite link</h2>
      <p>Anyone with this link can join the project.</p>
      <div className="controls">
        <input
          type="text"
          readOnly
          value={link}
          className="input"
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="button button--secondary" onClick={copy}>
          Copy
        </button>
        <button type="button" className="button button--secondary" disabled={pending} onClick={regenerate}>
          {pending ? "Generating…" : "Generate new link"}
        </button>
      </div>
    </section>
  );
}
