"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function BoardFilterBar({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="controls">
      <select
        className="input"
        defaultValue={searchParams.get("assignee") ?? ""}
        onChange={(e) => setParam("assignee", e.target.value)}
      >
        <option value="">Everyone</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        defaultValue={searchParams.get("priority") ?? ""}
        onChange={(e) => setParam("priority", e.target.value)}
      >
        <option value="">Any priority</option>
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>
      <input
        className="input"
        placeholder="Filter by label"
        defaultValue={searchParams.get("label") ?? ""}
        onBlur={(e) => setParam("label", e.target.value)}
      />
    </div>
  );
}
