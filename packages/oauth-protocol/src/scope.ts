export interface NormalizeScopeResult {
  ok: true;
  granted: string[];
  serialized: string;
}

export interface NormalizeScopeFailure {
  ok: false;
  error: "invalid_scope";
  unsupported: string[];
}

export function normalizeScope(
  input: string | null | undefined,
  allowed: readonly string[],
  options: { defaultIfEmpty?: readonly string[] } = {},
): NormalizeScopeResult | NormalizeScopeFailure {
  const tokens = (input ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    const fallback = options.defaultIfEmpty ?? [];
    return {
      ok: true,
      granted: [...fallback],
      serialized: fallback.join(" "),
    };
  }

  const seen = new Set<string>();
  const granted: string[] = [];
  const unsupported: string[] = [];

  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (allowed.includes(token)) {
      granted.push(token);
    } else {
      unsupported.push(token);
    }
  }

  if (unsupported.length > 0) {
    return { ok: false, error: "invalid_scope", unsupported };
  }

  return { ok: true, granted, serialized: granted.join(" ") };
}

export function scopeListFromSerialized(
  serialized: string | null | undefined,
): string[] {
  return (serialized ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function scopeSatisfies(
  granted: readonly string[],
  required: string,
): boolean {
  return granted.includes(required);
}
