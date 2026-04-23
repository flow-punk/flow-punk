function parseServiceTimeoutMs(value: string): number | null {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return null;
  }

  return timeoutMs;
}

export async function fetchWithServiceTimeout(
  service: Fetcher,
  input: string | URL | Request,
  init: RequestInit | undefined,
  timeoutMsValue: string,
): Promise<Response> {
  const timeoutMs = parseServiceTimeoutMs(timeoutMsValue);
  if (timeoutMs === null) {
    return service.fetch(new Request(input, init));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await service.fetch(
      new Request(input, {
        ...init,
        signal: controller.signal,
      }),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
