import * as p from '@clack/prompts';
import { runWranglerLogout } from '../auth/oauth.js';
import { theme } from '../ui/theme.js';

export async function logoutCommand(): Promise<void> {
  await runWranglerLogout();
  p.outro(
    `${theme.ok('✓')} Logged out (wrangler OAuth session cleared).\n${theme.dim('flowpunk does not persist tokens — nothing else to remove.')}`,
  );
}
