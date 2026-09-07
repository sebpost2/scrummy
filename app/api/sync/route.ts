import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rateLimit";
import { alreadyApplied, markApplied } from "@/lib/sync/dedup";
import { MUTATION_REGISTRY } from "@/lib/sync/mutationRegistry";
import type { OutboxMutationType } from "@/lib/sync/types";

const PERMANENT_ERROR_CODES = new Set([
  "NOT_A_MEMBER",
  "TASK_NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "TITLE_REQUIRED",
  "TITLE_TOO_LONG",
  "DESCRIPTION_TOO_LONG",
  "ASSIGNEE_NOT_A_MEMBER",
  "COMMENT_REQUIRED",
  "COMMENT_TOO_LONG",
  "COMMENT_NOT_FOUND",
  "NOT_COMMENT_AUTHOR",
  "COMMENT_DELETED",
  "SUBTASK_NOT_FOUND",
  "SUBTASK_TITLE_REQUIRED",
  "SUBTASK_TITLE_TOO_LONG",
  "TOO_MANY_LABELS",
  "NAME_TOO_LONG",
]);

interface SyncRequestBody {
  id: string;
  type: OutboxMutationType;
  args: unknown[];
  clientTimestamp: number;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED", permanent: false }, { status: 401 });
  }

  // Generous enough for an offline queue flushing a backlog, tight enough to
  // cap a runaway client. Transient so the client backs off and retries later.
  if (!(await allow("sync", 240, 60_000, user.id))) {
    return NextResponse.json({ error: "RATE_LIMITED", permanent: false }, { status: 429 });
  }

  let body: SyncRequestBody;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object") throw new Error("INVALID_BODY");
    body = parsed as SyncRequestBody;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", permanent: true }, { status: 400 });
  }

  // hasOwn, not a truthiness check: `type: "toString"` would otherwise resolve
  // an Object.prototype method as a "handler".
  if (!Object.hasOwn(MUTATION_REGISTRY, body.type)) {
    return NextResponse.json({ error: "UNKNOWN_MUTATION_TYPE", permanent: true }, { status: 400 });
  }
  const handler = MUTATION_REGISTRY[body.type];

  if (await alreadyApplied(body.id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  let result: unknown;
  try {
    result = await handler(user.id, body.args, new Date(body.clientTimestamp));
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (PERMANENT_ERROR_CODES.has(message)) {
      await markApplied(body.id);
      return NextResponse.json({ error: message, permanent: true }, { status: 400 });
    }
    return NextResponse.json({ error: "TRANSIENT", permanent: false }, { status: 502 });
  }

  if (result !== null && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok === false) {
    await markApplied(body.id);
    return NextResponse.json({ ...result, permanent: true }, { status: 400 });
  }

  await markApplied(body.id);
  return NextResponse.json({ ok: true, result });
}
