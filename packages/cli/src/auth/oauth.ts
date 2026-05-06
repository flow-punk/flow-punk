import { spawnSync, spawn } from 'node:child_process';
import { CliError } from '../util/errors.js';

/**
 * OAuth handling for Cloudflare via wrangler-as-subprocess.
 *
 * Approach (per plan):
 * 1. `flowpunk login` runs `wrangler login` (interactive, opens browser).
 * 2. Every subsequent CF API call shells `wrangler whoami --json`-ish
 *    behavior to obtain a fresh access token. Wrangler refreshes its OAuth
 *    tokens in-place; we never snapshot the token to disk.
 *
 * Wrangler does not currently expose a stable `auth token --json` command,
 * so we read the OAuth token from `~/.wrangler/config/default.toml` (the
 * documented file location) on demand. If wrangler relocates the file,
 * adjust `WRANGLER_TOKEN_PATHS` below.
 */

import { readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/**
 * Wrangler picks its config dir via the `env-paths` package, which uses
 * platform-specific conventions:
 *   - macOS:   ~/Library/Preferences/.wrangler/config/default.toml
 *   - Linux:   ~/.config/.wrangler/config/default.toml  (or $XDG_CONFIG_HOME)
 *   - Windows: %APPDATA%\.wrangler\Config\default.toml
 * Older wrangler 3.x and below put it at ~/.wrangler/config/default.toml.
 *
 * We probe each location in order and use the first one that has an
 * `oauth_token` field.
 */
const WRANGLER_TOKEN_PATHS = computeWranglerPaths();

function computeWranglerPaths(): string[] {
  const paths: string[] = [];
  const home = homedir();

  if (platform() === 'darwin') {
    paths.push(join(home, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'));
  } else if (platform() === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      paths.push(join(appData, '.wrangler', 'Config', 'default.toml'));
    }
  } else {
    // Linux / other: respect XDG_CONFIG_HOME, then default.
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) paths.push(join(xdg, '.wrangler', 'config', 'default.toml'));
    paths.push(join(home, '.config', '.wrangler', 'config', 'default.toml'));
  }

  // Legacy fallback (wrangler 3.x and earlier).
  paths.push(join(home, '.wrangler', 'config', 'default.toml'));

  return paths;
}

export interface ResolvedToken {
  apiToken: string;
  source: 'wrangler-oauth' | 'explicit';
}

/**
 * Run `wrangler login` interactively. Wrangler handles the browser open,
 * callback server, and token persistence. We just wait for the process to
 * exit. Throws CliError if wrangler is missing or the login fails.
 */
export async function runWranglerLogin(): Promise<void> {
  const probe = spawnSync('npx', ['wrangler', '--version'], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    // Surface wrangler's actual stderr so the user sees the real reason —
    // most commonly "Wrangler requires at least Node.js v22" on older Node.
    const stderr = (probe.stderr ?? '').trim();
    const stdout = (probe.stdout ?? '').trim();
    const detail = stderr || stdout;
    if (/Node\.js v\d+/i.test(detail)) {
      throw new CliError(
        'Your Node.js version is too old for wrangler',
        `${detail.split('\n')[0]}\nUpgrade Node (e.g. \`asdf install nodejs 22.11.0 && asdf global nodejs 22.11.0\`) and retry.`,
      );
    }
    throw new CliError(
      'wrangler could not run',
      detail
        ? `${detail.split('\n').slice(0, 3).join(' ')}\nIf wrangler isn't installed, run \`npm i -g wrangler\` or pass \`--token <CF_API_TOKEN>\`.`
        : 'Install wrangler (`npm i -g wrangler`) or pass `--token <CF_API_TOKEN>`.',
    );
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'login'], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new CliError(`wrangler login exited with code ${code}`));
    });
  });
}

/** Run `wrangler logout`. Best-effort. */
export async function runWranglerLogout(): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn('npx', ['wrangler', 'logout'], {
      stdio: 'inherit',
    });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

/**
 * Resolve the CF API token to use for this process. Order:
 *   1. Explicit `--token <token>` (or env CLOUDFLARE_API_TOKEN).
 *   2. Wrangler's stored OAuth access token (read fresh from disk every call).
 *
 * Throws CliError if no token can be resolved.
 */
export async function resolveToken(opts: { explicitToken?: string }): Promise<ResolvedToken> {
  const explicit = opts.explicitToken ?? process.env.CLOUDFLARE_API_TOKEN;
  if (explicit && explicit.trim().length > 0) {
    return { apiToken: explicit.trim(), source: 'explicit' };
  }
  const fromWrangler = await readWranglerToken();
  if (fromWrangler) {
    return { apiToken: fromWrangler, source: 'wrangler-oauth' };
  }
  throw new CliError(
    'No Cloudflare credentials found',
    'Run `flowpunk login` first, or pass `--token <CF_API_TOKEN>`.',
  );
}

async function readWranglerToken(): Promise<string | null> {
  for (const path of WRANGLER_TOKEN_PATHS) {
    try {
      const text = await readFile(path, 'utf8');
      const token = parseTomlOauthToken(text);
      if (token) return token;
    } catch {
      // file not found or unreadable — try next path
    }
  }
  return null;
}

/**
 * Lightweight TOML parser for the wrangler config — we only care about the
 * `oauth_token` key. Avoids pulling in a full TOML dep.
 */
function parseTomlOauthToken(text: string): string | null {
  const match = text.match(/^\s*oauth_token\s*=\s*"([^"]+)"/m);
  if (match && match[1]) return match[1];
  // Some wrangler builds nest under a section header; also try unquoted.
  const alt = text.match(/^\s*oauth_token\s*=\s*'([^']+)'/m);
  if (alt && alt[1]) return alt[1];
  return null;
}
