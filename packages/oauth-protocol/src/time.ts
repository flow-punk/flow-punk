export function isoNow(): string {
  return new Date().toISOString();
}

export function isoSecondsFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function isExpired(iso: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return t <= nowMs;
}

export function secondsUntil(iso: string, nowMs: number = Date.now()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - nowMs) / 1000));
}
