import { createContext, useContext, type ReactNode } from "react";

/**
 * The gateway origin (`https://api.example.com` or, in dev,
 * `http://localhost:8787`). Hooks below read it from context so
 * consumers (`useSession`, `<SignInScreen>`) don't each take it as
 * a prop.
 *
 * The dashboard-app factory mounts the provider with the value the
 * wrapping app supplied to `createDashboardApp({ apiOrigin })`.
 */
const ApiOriginContext = createContext<string | null>(null);

export function ApiOriginProvider({
  apiOrigin,
  children,
}: {
  apiOrigin: string;
  children: ReactNode;
}) {
  return (
    <ApiOriginContext.Provider value={apiOrigin}>
      {children}
    </ApiOriginContext.Provider>
  );
}

export function useApiOrigin(): string {
  const v = useContext(ApiOriginContext);
  if (!v) {
    throw new Error(
      "useApiOrigin must be used inside <ApiOriginProvider>. Wrap your app inside the dashboard-app factory.",
    );
  }
  return v;
}
