export function isNewer(incoming: Date, current: Date | null): boolean {
  if (!current) return true;
  return incoming.getTime() > current.getTime();
}
