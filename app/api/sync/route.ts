import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { alreadyApplied, markApplied } from "@/lib/sync/dedup";
import { MUTATION_REGISTRY } from "@/lib/sync/mutationRegistry";
import type { OutboxMutationType } from "@/lib/sync/types";

const PERMANENT_ERROR_CODES = new Set([
  "NOT_A_MEMBER",
  "TASK_NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "TITLE_REQUIRED",
  "ASSIGNEE_NOT_A_MEMBER",
  "COMMENT_REQUIRED",
  "COMMENT_NOT_FOUND",
  "NOT_COMMENT_AUTHOR",
  "COMMENT_DELETED",
  "SUBTASK_NOT_FOUND",
  "SUBTASK_TITLE_REQUIRED",
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

  const body = (await request.json()) as SyncRequestBody;
  const handler = MUTATION_REGISTRY[body.type];
  if (!handler) {
    return NextResponse.json({ error: "UNKNOWN_MUTATION_TYPE", permanent: true }, { status: 400 });
  }

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
