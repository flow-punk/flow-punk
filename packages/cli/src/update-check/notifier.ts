import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR =
  process.env.FLOWPUNK_CONFIG_DIR ?? join(homedir(), ".flowpunk");
const CACHE_FILE = join(CACHE_DIR, "cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

interface Cache {
  checkedAt: string;
  latest: string;
}

export interface UpgradeHint {
  hint: string | null;
}

/**
 * Check npm for a newer published version. Hard 2s timeout, 24h cache,
 * silent on failure. Respects DO_NOT_TRACK and CI to skip the network call
 * entirely. Never throws — returns `{ hint: null }` on any error.
 */
export async function checkForUpgrade(
  currentVersion: string,
): Promise<UpgradeHint> {
  if (process.env.DO_NOT_TRACK === "1" || process.env.CI === "true") {
    return { hint: null };
  }
  try {
    const cached = await readCache();
    const fresh =
      cached &&
      Date.now() - new Date(cached.checkedAt).getTime() < CACHE_TTL_MS;
    const latest = fresh ? cached.latest : await fetchLatest();
    if (!latest) return { hint: null };
    if (!fresh) {
      await writeCache({ checkedAt: new Date().toISOString(), latest });
    }
    if (semverGreater(latest, currentVersion)) {
      return {
        hint: `flowpunk ${latest} available — run \`npx flowpunk@latest\``,
      };
    }
    return { hint: null };
  } catch {
    return { hint: null };
  }
}

async function fetchLatest(): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://registry.npmjs.org/flowpunk/latest", {
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: unknown };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(): Promise<Cache | null> {
  try {
    const text = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Cache).checkedAt === "string" &&
      typeof (parsed as Cache).latest === "string"
    ) {
      return parsed as Cache;
    }
  } catch {
    // ignore
  }
  return null;
}

async function writeCache(cache: Cache): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CACHE_FILE, JSON.stringify(cache), { mode: 0o600 });
}

/**
 * Compare two semver-ish strings. Returns true if `a > b`. Handles standard
 * `MAJOR.MINOR.PATCH` plus `-prerelease.N` suffixes (lexical ordering, which
 * is enough for "alpha.1 < alpha.2 < beta.1" sorting).
 */
export function semverGreater(a: string, b: string): boolean {
  const [aMain, aPre = ""] = a.split("-", 2);
  const [bMain, bPre = ""] = b.split("-", 2);
  const ap = (aMain ?? "").split(".").map(Number);
  const bp = (bMain ?? "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const ai = ap[i] ?? 0;
    const bi = bp[i] ?? 0;
    if (ai !== bi) return ai > bi;
  }
  // Same MAJOR.MINOR.PATCH. A version WITHOUT a prerelease tag is greater.
  if (!aPre && bPre) return true;
  if (aPre && !bPre) return false;
  return aPre > bPre;
}
