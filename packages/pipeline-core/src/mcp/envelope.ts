import {
  INVALIDATE_TOOLS_HEADER,
  INVALIDATE_TOOLS_REASON_HEADER,
} from '@flowpunk/gateway/mcp';

export interface ExecuteEnvelope {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export function envelopeOk(data: unknown): ExecuteEnvelope {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError: false,
  };
}

export function envelopeErr(
  code: string,
  message: string,
  extra?: { nextStep?: string; details?: Record<string, unknown> },
): ExecuteEnvelope {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: {
            code,
            message,
            ...(extra?.nextStep ? { nextStep: extra.nextStep } : {}),
            ...(extra?.details ? { details: extra.details } : {}),
          },
        }),
      },
    ],
    isError: true,
  };
}

export interface MutationOptions {
  invalidateTools?: { reason: string };
}

export function envelopeResponse(
  status: number,
  envelope: ExecuteEnvelope,
  options: MutationOptions = {},
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.invalidateTools) {
    headers[INVALIDATE_TOOLS_HEADER] = 'true';
    headers[INVALIDATE_TOOLS_REASON_HEADER] = options.invalidateTools.reason;
  }
  return new Response(JSON.stringify(envelope), { status, headers });
}
