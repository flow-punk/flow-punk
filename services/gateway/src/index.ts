import type { Env, AppContext } from './types.js';
import { createIndieChain } from './middleware/index.js';
export { McpSessionDurableObject } from './mcp/index.js';

const handler = createIndieChain();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ctx: AppContext = {
      request,
      env,
      requestId: '',
    };

    return handler(ctx);
  },
} satisfies ExportedHandler<Env>;
