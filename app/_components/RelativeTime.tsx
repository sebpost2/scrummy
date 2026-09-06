"use client";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelative(from: Date, now: Date = new Date()): string {
  const deltaMs = now.getTime() - from.getTime();
  const abs = Math.abs(deltaMs);
  const suffix = (s: string) => (deltaMs >= 0 ? `${s} ago` : `in ${s}`);

  if (abs < 45_000) return "just now";
  if (abs < HOUR) return suffix(`${Math.round(abs / MIN)}m`);
  if (abs < DAY) return suffix(`${Math.round(abs / HOUR)}h`);
  if (abs < WEEK) return suffix(`${Math.round(abs / DAY)}d`);

  const sameYear = from.getFullYear() === now.getFullYear();
  return from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export default function RelativeTime({
  date,
  className,
}: {
  date: Date | string;
  className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time
      dateTime={d.toISOString()}
      title={d.toLocaleString()}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(d)}
    </time>
  );
}
