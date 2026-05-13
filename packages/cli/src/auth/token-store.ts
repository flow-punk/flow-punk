import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  rename,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { ConfigFile, DeploymentRecord } from "../types.js";

const CONFIG_DIR =
  process.env.FLOWPUNK_CONFIG_DIR ?? join(homedir(), ".flowpunk");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Read the config file, or return an empty config if absent. The file holds
 * deployment inventory (account ID, resource IDs, bundle hashes) but NEVER
 * an apiToken — see `auth/oauth.ts`.
 */
export async function readConfig(): Promise<ConfigFile> {
  try {
    const text = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as ConfigFile).version === 1 &&
      typeof (parsed as ConfigFile).deployments === "object"
    ) {
      const config = parsed as ConfigFile;
      // Defensive: if any deployment carries an apiToken field, drop it on read.
      for (const dep of Object.values(config.deployments)) {
        if (dep && "apiToken" in (dep as unknown as Record<string, unknown>)) {
          delete (dep as unknown as Record<string, unknown>).apiToken;
        }
      }
      return config;
    }
  } catch {
    // missing or malformed → start fresh
  }
  return { version: 1, deployments: {} };
}

/**
 * Atomically write the config file (mode 0600). Refuses to write any
 * deployment record that contains an `apiToken` field — token persistence
 * is a security regression.
 */
export async function writeConfig(config: ConfigFile): Promise<void> {
  for (const dep of Object.values(config.deployments)) {
    if (dep && "apiToken" in (dep as unknown as Record<string, unknown>)) {
      throw new Error(
        "token-store: deployment record carries an `apiToken` field — refusing to write. Tokens must never be persisted.",
      );
    }
  }
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  const json = JSON.stringify(config, null, 2);
  await writeFile(tmp, json, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, CONFIG_FILE);
}

/** Convenience: read just one deployment by `${accountId}:${prefix}` key. */
export async function readDeployment(
  key: string,
): Promise<DeploymentRecord | null> {
  const cfg = await readConfig();
  return cfg.deployments[key] ?? null;
}

export async function writeDeployment(
  key: string,
  record: DeploymentRecord,
): Promise<void> {
  const cfg = await readConfig();
  cfg.deployments[key] = record;
  await writeConfig(cfg);
}

export async function deleteDeployment(key: string): Promise<void> {
  const cfg = await readConfig();
  delete cfg.deployments[key];
  await writeConfig(cfg);
}

export function deploymentKey(accountId: string, prefix: string): string {
  return `${accountId}:${prefix}`;
}

/** Test-only — wipe the config file. */
export async function _testRemoveConfigFile(): Promise<void> {
  try {
    await unlink(CONFIG_FILE);
  } catch {
    /* ignore */
  }
}

export const _paths = { dir: CONFIG_DIR, file: CONFIG_FILE };

// Suppress unused-import warning when only paths re-export is consumed.
void dirname;
