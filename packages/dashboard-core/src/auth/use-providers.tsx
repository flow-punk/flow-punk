import { useQuery } from "@tanstack/react-query";
import { listProviders } from "./api.js";
import { useApiOrigin } from "./api-origin.js";
import type { AuthProviderDescriptor } from "./types.js";

/**
 * Provider ID → display label mapping. Indie ships only `emailPassword`;
 * managed adds `google` + `apple` at runtime by setting the env vars. The
 * UI never hardcodes the list — it renders what the server reports.
 */
const PROVIDER_LABELS: Record<string, string> = {
  emailPassword: "Email and password",
  google: "Continue with Google",
  apple: "Continue with Apple",
};

function describe(id: string): AuthProviderDescriptor {
  return {
    id: id as AuthProviderDescriptor["id"],
    label: PROVIDER_LABELS[id] ?? id,
  };
}

const PROVIDERS_QUERY_KEY = ["auth", "providers"] as const;

export interface UseProvidersResult {
  providers: ReadonlyArray<AuthProviderDescriptor>;
  isLoading: boolean;
  error: Error | null;
}

export function useProviders(): UseProvidersResult {
  const apiOrigin = useApiOrigin();
  const query = useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: () => listProviders(apiOrigin),
    // The provider list is a deploy-time concern; cache aggressively.
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return {
    providers: (query.data?.providers ?? []).map(describe),
    isLoading: query.isPending,
    error: query.error as Error | null,
  };
}
