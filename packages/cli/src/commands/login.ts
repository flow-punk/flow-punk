import * as p from '@clack/prompts';
import { runWranglerLogin, resolveToken } from '../auth/oauth.js';
import { theme } from '../ui/theme.js';

export interface LoginOpts {
  token?: string;
}

export async function loginCommand(opts: LoginOpts): Promise<void> {
  if (opts.token) {
    // Just verify and stash. We don't persist the token — but we do verify.
    const { resolveAndVerify } = await import('./helpers.js');
    await resolveAndVerify({ explicitToken: opts.token });
    p.note(
      `${theme.ok('✓')} Token accepted and verified.\n${theme.dim('Note: --token is not persisted. Pass it on every run.')}`,
      'Logged in (explicit token)',
    );
    return;
  }
  p.note(
    `Opening browser for Cloudflare OAuth.\n${theme.dim('Wrangler handles the flow; we read the token from its config on demand.')}`,
    'Cloudflare login',
  );
  await runWranglerLogin();
  // Verify by reading the token back and hitting /user/tokens/verify.
  const { resolveAndVerify } = await import('./helpers.js');
  await resolveAndVerify({});
  p.outro(`${theme.ok('✓')} Logged in.`);
  // Suppress unused-import warning when token branch is taken.
  void resolveToken;
}
