import { CliError } from '../util/errors.js';

/**
 * Smoke-test the deployed gateway by hitting `/health`. Retries a few times
 * because Workers can take a few hundred ms after PUT to be reachable.
 */
export async function smokeGateway(gatewayUrl: string): Promise<void> {
  const url = `${gatewayUrl.replace(/\/+$/, '')}/health`;
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // network blip — retry
    }
    await new Promise((r) => setTimeout(r, 750 * (i + 1)));
  }
  throw new CliError(
    `Gateway smoke test failed: ${url} did not return 200`,
    'The worker uploaded successfully but `/health` is not reachable. Check `flowpunk doctor`.',
  );
}
