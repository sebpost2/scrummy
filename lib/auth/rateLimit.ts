import { headers } from "next/headers";

// ponytail: in-memory fixed-window limiter. Per-instance only — on serverless
// with many instances it's a speed bump, not a wall. Move to Redis/Upstash or
// the platform WAF (Vercel Firewall) if abuse gets real.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Fixed-window counter. Returns true if the call is allowed. Pure + synchronous. */
export function hit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Enforce a limit for the current request, keyed by client IP plus an optional
 * extra key (e.g. a submitted email or the user id). Returns true if allowed.
 * No-op under Vitest so the suite isn't throttled — `hit` is tested directly.
 */
export async function allow(
  scope: string,
  limit: number,
  windowMs: number,
  extraKey?: string,
): Promise<boolean> {
  if (process.env.VITEST) return true;
  const ipOk = hit(`${scope}:ip:${await clientIp()}`, limit, windowMs);
  const keyOk = extraKey ? hit(`${scope}:k:${extraKey}`, limit, windowMs) : true;
  return ipOk && keyOk;
}
